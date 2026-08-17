import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

async function getAccessToken() {
  const clientId = Deno.env.get("EBAY_CLIENT_ID") ?? ""
  const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET") ?? ""
  const refreshToken = Deno.env.get("EBAY_REFRESH_TOKEN") ?? ""

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing eBay OAuth configuration")
  }

  const body = new URLSearchParams()
  body.set("grant_type", "refresh_token")
  body.set("refresh_token", refreshToken)

  const basic = btoa(`${clientId}:${clientSecret}`)

  const response = await fetch(
    "https://api.ebay.com/identity/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  )

  const data = await response.json()

  if (!response.ok || !data.access_token) {
    throw new Error(
      `Unable to refresh eBay access token: ${JSON.stringify(data)}`,
    )
  }

  return String(data.access_token)
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  let messageLogId: string | null = null

  const supabaseUrl =
    Deno.env.get("SUPABASE_URL") ?? ""

  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

  const supabase =
    supabaseUrl && serviceRoleKey
      ? createClient(
          supabaseUrl,
          serviceRoleKey,
        )
      : null

  try {
    if (req.method !== "POST") {
      return Response.json(
        {
          success: false,
          error: "POST required",
        },
        {
          status: 405,
          headers: corsHeaders,
        },
      )
    }

    if (!supabase) {
      throw new Error(
        "Missing Supabase service-role configuration",
      )
    }

    const body = await req.json()

    const ebayOrderId =
      String(
        body.ebay_order_id ?? "",
      ).trim()

    const ebayItemId =
      String(
        body.ebay_item_id ?? "",
      ).trim()

    const buyerUsername =
      String(
        body.buyer_username ?? "",
      ).trim()

    const messageType =
      String(
        body.message_type ?? "",
      ).trim()

    const subject =
      String(
        body.subject ??
          "Thank you for your order",
      ).trim()

    const messageText =
      String(
        body.message_text ?? "",
      ).trim()

    const isFreight =
      Boolean(body.is_freight)

    const freightConfirmationStatus =
      body.freight_confirmation_status
        ? String(
            body.freight_confirmation_status,
          ).trim()
        : null

    if (!ebayOrderId) {
      throw new Error(
        "ebay_order_id is required",
      )
    }

    if (!buyerUsername) {
      throw new Error(
        "buyer_username is required",
      )
    }

    if (!ebayItemId) {
      throw new Error(
        "ebay_item_id is required",
      )
    }

    if (!messageType) {
      throw new Error(
        "message_type is required",
      )
    }

    if (!messageText) {
      throw new Error(
        "message_text is required",
      )
    }

    if (messageText.length > 2000) {
      throw new Error(
        "message_text exceeds eBay 2000 character limit",
      )
    }

    // --------------------------------------------------
    // RESERVE MESSAGE BEFORE CONTACTING EBAY
    // --------------------------------------------------
    //
    // UNIQUE (ebay_order_id, message_type)
    // guarantees the same automatic message cannot
    // be sent twice for the same order.
    // --------------------------------------------------

    const { data: messageLog, error: reserveError } =
      await supabase
        .from("ebay_buyer_messages")
        .insert({
          ebay_order_id:
            ebayOrderId,
          ebay_item_id:
            ebayItemId,
          buyer_username:
            buyerUsername,
          message_type:
            messageType,
          subject,
          message_body:
            messageText,
          status:
            "pending",
          is_freight:
            isFreight,
          freight_confirmation_status:
            freightConfirmationStatus,
        })
        .select("id")
        .single()

    if (reserveError) {
      if (reserveError.code === "23505") {
        const { data: existingMessage } =
          await supabase
            .from("ebay_buyer_messages")
            .select(
              "id,status,sent_at,ebay_ack",
            )
            .eq(
              "ebay_order_id",
              ebayOrderId,
            )
            .eq(
              "message_type",
              messageType,
            )
            .maybeSingle()

        return Response.json(
          {
            success: true,
            skipped: true,
            reason:
              "duplicate_message_blocked",
            existing_message:
              existingMessage ?? null,
            ebay_order_id:
              ebayOrderId,
            message_type:
              messageType,
          },
          {
            headers: corsHeaders,
          },
        )
      }

      throw new Error(
        `Unable to reserve buyer message: ${reserveError.message}`,
      )
    }

    if (!messageLog?.id) {
      throw new Error(
        "Buyer message ledger returned no message ID",
      )
    }

    messageLogId =
      String(messageLog.id)

    // --------------------------------------------------
    // SEND THROUGH PROVEN EBAY TRADING API
    // --------------------------------------------------

    const accessToken =
      await getAccessToken()

    const xml =
      `<?xml version="1.0" encoding="utf-8"?>
<AddMemberMessageAAQToPartnerRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${escapeXml(ebayItemId)}</ItemID>
  <MemberMessage>
    <Subject>${escapeXml(subject)}</Subject>
    <Body>${escapeXml(messageText)}</Body>
    <QuestionType>CustomizedSubject</QuestionType>
    <RecipientID>${escapeXml(buyerUsername)}</RecipientID>
    <EmailCopyToSender>false</EmailCopyToSender>
  </MemberMessage>
</AddMemberMessageAAQToPartnerRequest>`

    const response =
      await fetch(
        "https://api.ebay.com/ws/api.dll",
        {
          method: "POST",
          headers: {
            "X-EBAY-API-CALL-NAME":
              "AddMemberMessageAAQToPartner",
            "X-EBAY-API-COMPATIBILITY-LEVEL":
              "1455",
            "X-EBAY-API-SITEID":
              "0",
            "X-EBAY-API-IAF-TOKEN":
              accessToken,
            "Content-Type":
              "text/xml",
          },
          body: xml,
        },
      )

    const responseText =
      await response.text()

    if (!response.ok) {
      throw new Error(
        `eBay Trading message request failed (${response.status}): ${responseText}`,
      )
    }

    const ackMatch =
      responseText.match(
        /<Ack>(.*?)<\/Ack>/,
      )

    const ack =
      ackMatch?.[1] ?? "Unknown"

    if (
      ack !== "Success" &&
      ack !== "Warning"
    ) {
      throw new Error(
        `eBay Trading message failed: ${responseText}`,
      )
    }

    const sentAt =
      new Date().toISOString()

    const { error: sentLogError } =
      await supabase
        .from("ebay_buyer_messages")
        .update({
          status:
            "sent",
          ebay_ack:
            ack,
          sent_at:
            sentAt,
          updated_at:
            sentAt,
          error_message:
            null,
        })
        .eq(
          "id",
          messageLogId,
        )

    if (sentLogError) {
      throw new Error(
        `Message sent by eBay but ledger update failed: ${sentLogError.message}`,
      )
    }

    return Response.json(
      {
        success: true,
        skipped: false,
        ack,
        message_log_id:
          messageLogId,
        ebay_order_id:
          ebayOrderId,
        message_type:
          messageType,
        buyer_username:
          buyerUsername,
        ebay_item_id:
          ebayItemId,
      },
      {
        headers: corsHeaders,
      },
    )
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error)

    if (
      supabase &&
      messageLogId
    ) {
      const failedAt =
        new Date().toISOString()

      await supabase
        .from("ebay_buyer_messages")
        .update({
          status:
            "failed",
          error_message:
            errorMessage,
          updated_at:
            failedAt,
        })
        .eq(
          "id",
          messageLogId,
        )
    }

    return Response.json(
      {
        success: false,
        error:
          errorMessage,
        message_log_id:
          messageLogId,
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }
})
