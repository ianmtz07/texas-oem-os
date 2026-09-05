import fetchNode from "npm:node-fetch@3.3.2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const EBAY_POLICY_IDS = {
  payment: {
    immediate: "236649486013",
    standard: "251172732013",
  },
  returns: {
    accepted: "236649485013",
    noReturns: "241392395013",
  },
  fulfillment: {
    free: "251652756013",
  },
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}


async function getOrCreateFulfillmentPolicyId(
  accessToken: string,
  shippingType: "FLAT_RATE" | "FREIGHT",
  shippingAmount: string,
) {
  const amount = Number(shippingAmount)

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid shipping amount")
  }

  const listResponse = await fetch(
    "https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  )

  const listData = await listResponse.json()

  if (!listResponse.ok) {
    throw new Error(
      `Unable to load eBay fulfillment policies: ${JSON.stringify(listData)}`,
    )
  }

  const policies = Array.isArray(listData.fulfillmentPolicies)
    ? listData.fulfillmentPolicies
    : []

  const serviceCode =
    shippingType === "FREIGHT"
      ? "FlatRateFreight"
      : "ShippingMethodStandard"

  for (const policy of policies) {
    const shippingOptions = Array.isArray(policy?.shippingOptions)
      ? policy.shippingOptions
      : []

    for (const option of shippingOptions) {
      if (option?.costType !== "FLAT_RATE") continue

      const services = Array.isArray(option?.shippingServices)
        ? option.shippingServices
        : []

      for (const service of services) {
        const serviceAmount = Number(service?.shippingCost?.value)

        if (
          service?.shippingServiceCode === serviceCode &&
          Number.isFinite(serviceAmount) &&
          Math.abs(serviceAmount - amount) < 0.001
        ) {
          return String(policy.fulfillmentPolicyId)
        }
      }
    }
  }

  const formattedAmount = amount.toFixed(2)

  const createPayload = {
    name:
      shippingType === "FREIGHT"
        ? `Texas OEM OS Freight $${formattedAmount}`
        : `Texas OEM OS Flat $${formattedAmount}`,
    marketplaceId: "EBAY_US",
    categoryTypes: [
      {
        name: "ALL_EXCLUDING_MOTORS_VEHICLES",
      },
    ],
    handlingTime: {
      value: 3,
      unit: "DAY",
    },
    shippingOptions: [
      {
        optionType: "DOMESTIC",
        costType: "FLAT_RATE",
        shippingServices: [
          {
            sortOrder: 1,
            shippingCarrierCode: "GENERIC",
            shippingServiceCode: serviceCode,
            shippingCost: {
              value: formattedAmount,
              currency: "USD",
            },
            additionalShippingCost: {
              value: "0.00",
              currency: "USD",
            },
            freeShipping: false,
            buyerResponsibleForShipping: false,
            buyerResponsibleForPickup: false,
          },
        ],
      },
    ],
  }

  const createResponse = await fetch(
    "https://api.ebay.com/sell/account/v1/fulfillment_policy",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Language": "en-US",
        Accept: "application/json",
      },
      body: JSON.stringify(createPayload),
    },
  )

  const createData = await createResponse.json()

  if (!createResponse.ok || !createData.fulfillmentPolicyId) {
    throw new Error(
      `Unable to create eBay fulfillment policy: ${JSON.stringify(createData)}`,
    )
  }

  return String(createData.fulfillmentPolicyId)
}

async function getAccessToken() {
  const clientId = Deno.env.get("EBAY_CLIENT_ID") ?? ""
  const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET") ?? ""
  const refreshToken = Deno.env.get("EBAY_REFRESH_TOKEN") ?? ""

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing eBay OAuth configuration")
  }

  const basic = btoa(`${clientId}:${clientSecret}`)

  const body = new URLSearchParams()
  body.set("grant_type", "refresh_token")
  body.set("refresh_token", refreshToken)

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
    throw new Error(`eBay token refresh failed: ${JSON.stringify(data)}`)
  }

  return String(data.access_token)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return Response.json(
      { success: false, error: "Method not allowed" },
      { status: 405, headers: corsHeaders },
    )
  }

  try {
    const body = await req.json().catch(() => ({}))

    const mode = clean(body.mode) || "PREVIEW_ONLY"

    if (mode === "GET_POLICIES") {
      const accessToken = await getAccessToken()

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      }

      const [
        fulfillmentResponse,
        paymentResponse,
        returnResponse,
      ] = await Promise.all([
        fetch(
          "https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US",
          { headers },
        ),
        fetch(
          "https://api.ebay.com/sell/account/v1/payment_policy?marketplace_id=EBAY_US",
          { headers },
        ),
        fetch(
          "https://api.ebay.com/sell/account/v1/return_policy?marketplace_id=EBAY_US",
          { headers },
        ),
      ])

      const [
        fulfillmentText,
        paymentText,
        returnText,
      ] = await Promise.all([
        fulfillmentResponse.text(),
        paymentResponse.text(),
        returnResponse.text(),
      ])

      const parseJson = (value: string) => {
        try {
          return JSON.parse(value)
        } catch {
          return value
        }
      }

      return Response.json(
        {
          success:
            fulfillmentResponse.ok &&
            paymentResponse.ok &&
            returnResponse.ok,
          fulfillment: {
            http: fulfillmentResponse.status,
            data: parseJson(fulfillmentText),
          },
          payment: {
            http: paymentResponse.status,
            data: parseJson(paymentText),
          },
          returns: {
            http: returnResponse.status,
            data: parseJson(returnText),
          },
        },
        { headers: corsHeaders },
      )
    }

    if (mode === "DELETE_OFFER") {
      const offerId = clean(body.offerId)

      if (!offerId) {
        return Response.json(
          {
            success: false,
            mode: "DELETE_OFFER",
            error: "Offer ID is required.",
          },
          { headers: corsHeaders },
        )
      }

      const accessToken = await getAccessToken()

      const deleteResponse = await fetch(
        `https://api.ebay.com/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Language": "en-US",
          },
        },
      )

      const deleteText = await deleteResponse.text()

      if (!deleteResponse.ok) {
        return Response.json(
          {
            success: false,
            mode: "DELETE_OFFER",
            stage: "delete-offer",
            ebayHttp: deleteResponse.status,
            ebayResponse: deleteText,
          },
          { headers: corsHeaders },
        )
      }

      return Response.json(
        {
          success: true,
          mode: "DELETE_OFFER",
          offerId,
          message: "Unpublished eBay offer deleted.",
        },
        { headers: corsHeaders },
      )
    }

    if (mode === "BULK_REPAIR_DESCRIPTIONS") {
      /*
       * ONE-TIME / MAINTENANCE BULK REPAIR
       *
       * Finds recently-created drafts whose LIVE eBay offer
       * still contains a known contaminated description marker.
       *
       * Correct HTML comes from listing_drafts.description_html
       * matched by the exact part_id.
       *
       * DRY RUN is the default.
       */

      const dryRun =
        body.dryRun !== false

      const markers =
        Array.isArray(body.markers)
          ? body.markers
              .map((value: unknown) =>
                clean(value)
              )
              .filter(Boolean)
          : []

      const limit =
        Math.min(
          Math.max(
            Number(body.limit ?? 60) || 60,
            1,
          ),
          100,
        )

      if (markers.length === 0) {
        return Response.json(
          {
            success: false,
            mode:
              "BULK_REPAIR_DESCRIPTIONS",
            error:
              "At least one contamination marker is required.",
          },
          {
            headers: corsHeaders,
          },
        )
      }

      const supabaseUrl =
        Deno.env.get("SUPABASE_URL") ?? ""

      const serviceRoleKey =
        Deno.env.get(
          "SUPABASE_SERVICE_ROLE_KEY",
        ) ?? ""

      if (
        !supabaseUrl ||
        !serviceRoleKey
      ) {
        throw new Error(
          "Supabase service-role configuration is unavailable.",
        )
      }

      const dbHeaders = {
        apikey: serviceRoleKey,
        Authorization:
          `Bearer ${serviceRoleKey}`,
        "Content-Type":
          "application/json",
      }

      /*
       * Pull only the newest drafts.
       * The contamination happened in the recent listing run,
       * so there is no reason to hammer every historical listing.
       */
      const draftsResponse =
        await fetch(
          `${supabaseUrl}/rest/v1/listing_drafts` +
          `?select=part_id,description_html,ebay_draft_created_at` +
          `&order=ebay_draft_created_at.desc.nullslast` +
          `&limit=${limit}`,
          {
            headers: dbHeaders,
          },
        )

      const draftsText =
        await draftsResponse.text()

      if (!draftsResponse.ok) {
        throw new Error(
          `Unable to load listing drafts: ${draftsText}`,
        )
      }

      const draftRows =
        draftsText
          ? JSON.parse(draftsText)
          : []

      const partsResponse =
        await fetch(
          `${supabaseUrl}/rest/v1/parts` +
          `?select=id,sku,listed,part_master:part_master_id(part_code)` +
          `&listed=eq.true`,
          {
            headers: dbHeaders,
          },
        )

      const partsText =
        await partsResponse.text()

      if (!partsResponse.ok) {
        throw new Error(
          `Unable to load listed parts: ${partsText}`,
        )
      }

      const partRows =
        partsText
          ? JSON.parse(partsText)
          : []

      const partById =
        new Map<
          string,
          Record<string, unknown>
        >()

      for (
        const rawPart of partRows
      ) {
        const row =
          rawPart as Record<
            string,
            unknown
          >

        const id =
          clean(row.id)

        if (id) {
          partById.set(
            id,
            row,
          )
        }
      }

      const accessToken =
        await getAccessToken()

      const checked: Array<
        Record<string, unknown>
      > = []

      const repaired: Array<
        Record<string, unknown>
      > = []

      const skipped: Array<
        Record<string, unknown>
      > = []

      const failed: Array<
        Record<string, unknown>
      > = []

      for (
        const rawDraft of draftRows
      ) {
        const draftRow =
          rawDraft as Record<
            string,
            unknown
          >

        const partId =
          clean(
            draftRow.part_id,
          )

        const correctHtml =
          clean(
            draftRow.description_html,
          )

        const part =
          partById.get(partId)

        if (
          !part ||
          !correctHtml
        ) {
          continue
        }

        const sku =
          clean(part.sku)

        const relatedPartMaster =
          part.part_master &&
          typeof part.part_master === "object"
            ? part.part_master as Record<string, unknown>
            : {}

        const partNumber =
          clean(
            relatedPartMaster.part_code,
          )

        if (!sku) {
          continue
        }

        /*
         * The actual screen listing itself is NOT corrupted.
         * If its CORRECT saved HTML contains one of the bad
         * markers, leave it alone.
         */
        const correctHtmlHasMarker =
          markers.some(
            (marker) =>
              correctHtml
                .toLowerCase()
                .includes(
                  marker.toLowerCase(),
                ),
          )

        if (
          correctHtmlHasMarker
        ) {
          skipped.push({
            sku,
            partNumber,
            reason:
              "Correct HTML legitimately contains contamination marker.",
          })

          continue
        }

        try {
          const offersResponse =
            await fetch(
              `https://api.ebay.com/sell/inventory/v1/offer?sku=${
                encodeURIComponent(
                  sku,
                )
              }`,
              {
                method: "GET",
                headers: {
                  Authorization:
                    `Bearer ${accessToken}`,
                  Accept:
                    "application/json",
                  "Accept-Language":
                    "en-US",
                  "Content-Language":
                    "en-US",
                },
              },
            )

          const offersText =
            await offersResponse.text()

          if (
            !offersResponse.ok
          ) {
            failed.push({
              sku,
              stage:
                "lookup-offer",
              ebayHttp:
                offersResponse.status,
              ebayResponse:
                offersText,
            })

            continue
          }

          const offersData =
            offersText
              ? JSON.parse(
                  offersText,
                )
              : {}

          const offers =
            Array.isArray(
              offersData.offers,
            )
              ? offersData.offers
              : []

          /*
           * We ONLY repair a published/live offer.
           */
          const liveOffer =
            offers.find(
              (
                offer:
                  Record<
                    string,
                    unknown
                  >,
              ) =>
                offer.listing,
            )

          if (!liveOffer) {
            continue
          }

          const offerId =
            clean(
              liveOffer.offerId,
            )

          if (!offerId) {
            continue
          }

          /*
           * Get the authoritative current offer body.
           */
          const getOfferResponse =
            await fetch(
              `https://api.ebay.com/sell/inventory/v1/offer/${
                encodeURIComponent(
                  offerId,
                )
              }`,
              {
                method: "GET",
                headers: {
                  Authorization:
                    `Bearer ${accessToken}`,
                  Accept:
                    "application/json",
                  "Accept-Language":
                    "en-US",
                  "Content-Language":
                    "en-US",
                },
              },
            )

          const getOfferText =
            await getOfferResponse.text()

          if (
            !getOfferResponse.ok
          ) {
            failed.push({
              sku,
              offerId,
              stage:
                "get-live-offer",
              ebayHttp:
                getOfferResponse.status,
              ebayResponse:
                getOfferText,
            })

            continue
          }

          const currentOffer =
            getOfferText
              ? JSON.parse(
                  getOfferText,
                )
              : {}

          const currentDescription =
            clean(
              currentOffer
                .listingDescription,
            )

          const contaminationMarker =
            markers.find(
              (marker) =>
                currentDescription
                  .toLowerCase()
                  .includes(
                    marker.toLowerCase(),
                  ),
            )

          checked.push({
            sku,
            partNumber,
            offerId,
            contaminated:
              Boolean(
                contaminationMarker,
              ),
            marker:
              contaminationMarker ??
              null,
          })

          if (
            !contaminationMarker
          ) {
            continue
          }

          /*
           * DRY RUN:
           * identify the contaminated listing but do not touch it.
           */
          if (dryRun) {
            repaired.push({
              sku,
              partNumber,
              offerId,
              marker:
                contaminationMarker,
              action:
                "WOULD_REPAIR",
            })

            continue
          }

          const {
            offerId:
              _offerId,
            listing:
              _listing,
            warnings:
              _warnings,
            ...offerForUpdate
          } =
            currentOffer

          const updatePayload = {
            ...offerForUpdate,
            listingDescription:
              correctHtml,
          }

          const updateResponse =
            await fetch(
              `https://api.ebay.com/sell/inventory/v1/offer/${
                encodeURIComponent(
                  offerId,
                )
              }`,
              {
                method: "PUT",
                headers: {
                  Authorization:
                    `Bearer ${accessToken}`,
                  "Content-Type":
                    "application/json",
                  "Accept-Language":
                    "en-US",
                  "Content-Language":
                    "en-US",
                },
                body:
                  JSON.stringify(
                    updatePayload,
                  ),
              },
            )

          const updateText =
            await updateResponse.text()

          if (
            !updateResponse.ok
          ) {
            failed.push({
              sku,
              offerId,
              stage:
                "repair-description",
              ebayHttp:
                updateResponse.status,
              ebayResponse:
                updateText,
            })

            continue
          }

          repaired.push({
            sku,
            partNumber,
            offerId,
            marker:
              contaminationMarker,
            action:
              "REPAIRED",
          })
        } catch (
          listingError
        ) {
          failed.push({
            sku,
            error:
              listingError
                instanceof Error
                ? listingError.message
                : String(
                    listingError,
                  ),
          })
        }
      }

      return Response.json(
        {
          success:
            failed.length === 0,
          mode:
            "BULK_REPAIR_DESCRIPTIONS",
          dryRun,
          markers,
          draftsScanned:
            draftRows.length,
          liveOffersChecked:
            checked.length,
          contaminatedFound:
            repaired.length,
          repaired:
            dryRun
              ? 0
              : repaired.length,
          candidates:
            repaired,
          skipped,
          failed,
        },
        {
          headers:
            corsHeaders,
        },
      )
    }

    if (mode === "PREPARE_PUBLISH_REVIEW") {
      const sku = clean(body.sku)

      if (!sku) {
        return Response.json(
          {
            success: false,
            mode: "PREPARE_PUBLISH_REVIEW",
            stage: "validate-review",
            error: "SKU is required.",
          },
          { headers: corsHeaders },
        )
      }

      const accessToken = await getAccessToken()

      const offersResponse = await fetchNode(
        `https://api.ebay.com/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        },
      )

      const offersText = await offersResponse.text()

      let offersData: Record<string, unknown> = {}

      try {
        offersData = offersText
          ? JSON.parse(offersText) as Record<string, unknown>
          : {}
      } catch {
        offersData = {}
      }

      if (!offersResponse.ok) {
        return Response.json(
          {
            success: false,
            mode: "PREPARE_PUBLISH_REVIEW",
            stage: "lookup-review-offer",
            ebayHttp: offersResponse.status,
            ebayResponse: offersText,
          },
          { headers: corsHeaders },
        )
      }

      const offers = Array.isArray(offersData.offers)
        ? offersData.offers as Array<Record<string, unknown>>
        : []

      const reviewOffer =
        offers.find((offer) => !offer.listing) ??
        offers[0]

      const offerId = clean(reviewOffer?.offerId)

      if (!offerId) {
        return Response.json(
          {
            success: false,
            mode: "PREPARE_PUBLISH_REVIEW",
            stage: "lookup-review-offer",
            error: `No eBay offer found for SKU ${sku}.`,
          },
          { headers: corsHeaders },
        )
      }

      const offerResponse = await fetchNode(
        `https://api.ebay.com/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        },
      )

      const offerText = await offerResponse.text()

      let offerData: Record<string, unknown> = {}

      try {
        offerData = offerText
          ? JSON.parse(offerText) as Record<string, unknown>
          : {}
      } catch {
        offerData = {}
      }

      if (!offerResponse.ok) {
        return Response.json(
          {
            success: false,
            mode: "PREPARE_PUBLISH_REVIEW",
            stage: "get-review-offer",
            ebayHttp: offerResponse.status,
            ebayResponse: offerText,
          },
          { headers: corsHeaders },
        )
      }

      const listingPolicies =
        offerData.listingPolicies &&
        typeof offerData.listingPolicies === "object"
          ? offerData.listingPolicies as Record<string, unknown>
          : {}

      const fulfillmentPolicyId =
        clean(listingPolicies.fulfillmentPolicyId)

      const paymentPolicyId =
        clean(listingPolicies.paymentPolicyId)

      const returnPolicyId =
        clean(listingPolicies.returnPolicyId)

      let shippingType = "UNKNOWN"
      let shippingAmount = ""
      let shippingLabel =
        fulfillmentPolicyId
          ? `Unknown (${fulfillmentPolicyId})`
          : "Unknown"

      if (fulfillmentPolicyId) {
        const fulfillmentResponse = await fetchNode(
          `https://api.ebay.com/sell/account/v1/fulfillment_policy/${encodeURIComponent(fulfillmentPolicyId)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
            },
          },
        )

        const fulfillmentText =
          await fulfillmentResponse.text()

        let fulfillmentData:
          Record<string, unknown> = {}

        try {
          fulfillmentData =
            fulfillmentText
              ? JSON.parse(
                  fulfillmentText,
                ) as Record<string, unknown>
              : {}
        } catch {
          fulfillmentData = {}
        }

        if (!fulfillmentResponse.ok) {
          return Response.json(
            {
              success: false,
              mode: "PREPARE_PUBLISH_REVIEW",
              stage: "get-review-fulfillment-policy",
              ebayHttp:
                fulfillmentResponse.status,
              ebayResponse:
                fulfillmentText,
            },
            { headers: corsHeaders },
          )
        }

        const shippingOptions =
          Array.isArray(
            fulfillmentData.shippingOptions,
          )
            ? fulfillmentData.shippingOptions as Array<Record<string, unknown>>
            : []

        const domesticOption =
          shippingOptions.find(
            (option) =>
              clean(option.optionType) ===
              "DOMESTIC",
          ) ??
          shippingOptions[0]

        const services =
          Array.isArray(
            domesticOption?.shippingServices,
          )
            ? domesticOption.shippingServices as Array<Record<string, unknown>>
            : []

        const primaryService =
          services.find(
            (service) =>
              clean(
                service.shippingServiceCode,
              ) !== "Pickup",
          ) ??
          services[0]

        const serviceCode =
          clean(
            primaryService?.shippingServiceCode,
          )

        const freeShipping =
          primaryService?.freeShipping === true

        const shippingCost =
          primaryService?.shippingCost &&
          typeof primaryService.shippingCost ===
            "object"
            ? primaryService.shippingCost as
                Record<string, unknown>
            : {}

        shippingAmount =
          clean(shippingCost.value)

        if (
          freeShipping ||
          fulfillmentPolicyId ===
            EBAY_POLICY_IDS.fulfillment.free
        ) {
          shippingType = "FREE"
          shippingLabel = "Free Shipping"
          shippingAmount = ""
        } else if (
          serviceCode === "FlatRateFreight"
        ) {
          shippingType = "FREIGHT"
          shippingLabel =
            `Flat Rate Freight — $${Number(shippingAmount || 0).toFixed(2)}`
        } else {
          shippingType = "FLAT_RATE"
          shippingLabel =
            `Buyer-Paid Flat Rate — $${Number(shippingAmount || 0).toFixed(2)}`
        }
      }

      const returnsLabel =
        returnPolicyId ===
          EBAY_POLICY_IDS.returns.noReturns
          ? "No Returns"
          : returnPolicyId ===
              EBAY_POLICY_IDS.returns.accepted
            ? "Returns Accepted"
            : `Unknown (${returnPolicyId || "no policy"})`

      const paymentLabel =
        paymentPolicyId ===
          EBAY_POLICY_IDS.payment.immediate
          ? "Require Immediate Payment"
          : paymentPolicyId ===
              EBAY_POLICY_IDS.payment.standard
            ? "Standard eBay Payment"
            : `Unknown (${paymentPolicyId || "no policy"})`

      return Response.json(
        {
          success: true,
          mode: "PREPARE_PUBLISH_REVIEW",
          sku,
          offerId,
          review: {
            returns: returnsLabel,
            shipping: shippingLabel,
            shippingType,
            shippingAmount,
            payment: paymentLabel,
          },
          policyIds: {
            fulfillmentPolicyId,
            paymentPolicyId,
            returnPolicyId,
          },
        },
        { headers: corsHeaders },
      )
    }

    if (mode === "PUBLISH_OFFER") {
      let offerId = clean(body.offerId)
      const sku = clean(body.sku)
      const partId = clean(body.partId)

      const publishDraft =
        body.draft &&
        typeof body.draft === "object"
          ? body.draft as Record<string, unknown>
          : {}

      const listingTitle =
        clean(publishDraft.title) ||
        sku ||
        "Texas OEM Parts Listing"

      const supabaseUrl =
        Deno.env.get("SUPABASE_URL") ?? ""

      const serviceRoleKey =
        Deno.env.get(
          "SUPABASE_SERVICE_ROLE_KEY",
        ) ?? ""

      if (
        !supabaseUrl ||
        !serviceRoleKey
      ) {
        throw new Error(
          "Supabase service-role configuration is unavailable.",
        )
      }

      const persistLiveListingLink =
        async (listingId: string) => {
          if (!partId) {
            throw new Error(
              `Published eBay Item ${listingId}, but no Texas OEM part ID was supplied.`,
            )
          }

          const response =
            await fetch(
              `${supabaseUrl}/rest/v1/ebay_listings?on_conflict=ebay_item_id`,
              {
                method: "POST",
                headers: {
                  apikey:
                    serviceRoleKey,
                  Authorization:
                    `Bearer ${serviceRoleKey}`,
                  "Content-Type":
                    "application/json",
                  Prefer:
                    "resolution=merge-duplicates,return=minimal",
                },
                body: JSON.stringify({
                  ebay_item_id:
                    listingId,
                  sku:
                    sku || null,
                  title:
                    listingTitle,
                  matched_part_id:
                    partId,
                  ebay_status:
                    "active",
                  updated_at:
                    new Date().toISOString(),
                }),
              },
            )

          if (!response.ok) {
            throw new Error(
              `eBay Item ${listingId} is live, but Texas OEM inventory linkage failed: ${await response.text()}`,
            )
          }
        }

      const accessToken = await getAccessToken()

      if (!offerId) {
        if (!sku) {
          return Response.json(
            {
              success: false,
              mode: "PUBLISH_OFFER",
              stage: "publish-offer",
              error: "Offer ID or SKU is required.",
            },
            { headers: corsHeaders },
          )
        }

        const offersResponse = await fetch(
          `https://api.ebay.com/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept": "application/json",
              "Accept-Language": "en-US",
              "Content-Language": "en-US",
            },
          },
        )

        const offersText = await offersResponse.text()

        let offersData: Record<string, unknown> = {}

        try {
          offersData = offersText
            ? JSON.parse(offersText) as Record<string, unknown>
            : {}
        } catch {
          offersData = {}
        }

        if (!offersResponse.ok) {
          return Response.json(
            {
              success: false,
              mode: "PUBLISH_OFFER",
              stage: "lookup-offer",
              ebayHttp: offersResponse.status,
              ebayResponse: offersText,
            },
            { headers: corsHeaders },
          )
        }

        const offers = Array.isArray(offersData.offers)
          ? offersData.offers as Array<Record<string, unknown>>
          : []

        const unpublishedOffer =
          offers.find((offer) => !offer.listing) ??
          offers[0]

        offerId = clean(unpublishedOffer?.offerId)

        if (!offerId) {
          return Response.json(
            {
              success: false,
              mode: "PUBLISH_OFFER",
              stage: "lookup-offer",
              error: `No eBay offer found for SKU ${sku}.`,
              ebayResponse: offersText,
            },
            { headers: corsHeaders },
          )
        }
      }

      const latestDraft =
        body.draft &&
        typeof body.draft === "object"
          ? body.draft as Record<string, unknown>
          : {}

      const latestDescriptionHtml =
        clean(latestDraft.descriptionHtml)

      const latestTitle =
        clean(latestDraft.title).slice(0, 80)

      /*
       * LIVE LISTING REVISION:
       *
       * Product title belongs to the Inventory Item.
       * Description belongs to the Offer.
       *
       * Update both before deciding whether this offer
       * needs to be published for the first time.
       */
      if (latestTitle && sku) {
        const inventoryUrl =
          `https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`

        const getInventoryResponse =
          await fetch(
            inventoryUrl,
            {
              method: "GET",
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
                "Accept":
                  "application/json",
                "Accept-Language":
                  "en-US",
                "Content-Language":
                  "en-US",
              },
            },
          )

        const getInventoryText =
          await getInventoryResponse.text()

        let currentInventory:
          Record<string, unknown> = {}

        try {
          currentInventory =
            getInventoryText
              ? JSON.parse(
                  getInventoryText,
                ) as Record<string, unknown>
              : {}
        } catch {
          currentInventory = {}
        }

        if (!getInventoryResponse.ok) {
          return Response.json(
            {
              success: false,
              mode: "PUBLISH_OFFER",
              stage:
                "get-inventory-before-title-sync",
              ebayHttp:
                getInventoryResponse.status,
              ebayResponse:
                getInventoryText,
            },
            {
              headers: corsHeaders,
            },
          )
        }

        const currentProduct =
          currentInventory.product &&
          typeof currentInventory.product ===
            "object"
            ? currentInventory.product as
                Record<string, unknown>
            : {}

        const inventoryUpdatePayload = {
          availability:
            currentInventory.availability,
          condition:
            currentInventory.condition,
          conditionDescription:
            currentInventory.conditionDescription,
          packageWeightAndSize:
            currentInventory.packageWeightAndSize,
          product: {
            ...currentProduct,
            title: latestTitle,
          },
        }

        const updateInventoryResponse =
          await fetch(
            inventoryUrl,
            {
              method: "PUT",
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
                "Content-Type":
                  "application/json",
                "Accept-Language":
                  "en-US",
                "Content-Language":
                  "en-US",
              },
              body: JSON.stringify(
                inventoryUpdatePayload,
              ),
            },
          )

        const updateInventoryText =
          await updateInventoryResponse.text()

        if (!updateInventoryResponse.ok) {
          return Response.json(
            {
              success: false,
              mode: "PUBLISH_OFFER",
              stage:
                "sync-latest-title",
              ebayHttp:
                updateInventoryResponse.status,
              ebayResponse:
                updateInventoryText,
            },
            {
              headers: corsHeaders,
            },
          )
        }
      }

      let liveListingId = ""

      if (latestDescriptionHtml || latestTitle) {
        const getOfferResponse = await fetch(
          `https://api.ebay.com/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept": "application/json",
              "Accept-Language": "en-US",
              "Content-Language": "en-US",
            },
          },
        )

        const getOfferText = await getOfferResponse.text()

        let currentOffer: Record<string, unknown> = {}

        try {
          currentOffer = getOfferText
            ? JSON.parse(getOfferText) as Record<string, unknown>
            : {}
        } catch {
          currentOffer = {}
        }

        if (!getOfferResponse.ok) {
          return Response.json(
            {
              success: false,
              mode: "PUBLISH_OFFER",
              stage: "get-offer-before-sync",
              ebayHttp: getOfferResponse.status,
              ebayResponse: getOfferText,
            },
            { headers: corsHeaders },
          )
        }

        const currentListing =
          currentOffer.listing &&
          typeof currentOffer.listing ===
            "object"
            ? currentOffer.listing as
                Record<string, unknown>
            : {}

        liveListingId =
          clean(currentListing.listingId)

        const {
          offerId: _offerId,
          listing: _listing,
          warnings: _warnings,
          ...offerForUpdate
        } = currentOffer

        const updateOfferPayload = {
          ...offerForUpdate,
          ...(latestDescriptionHtml
            ? {
                listingDescription:
                  latestDescriptionHtml,
              }
            : {}),
        }

        const updateOfferResponse = await fetch(
          `https://api.ebay.com/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "Accept-Language": "en-US",
              "Content-Language": "en-US",
            },
            body: JSON.stringify(updateOfferPayload),
          },
        )

        const updateOfferText = await updateOfferResponse.text()

        if (!updateOfferResponse.ok) {
          return Response.json(
            {
              success: false,
              mode: "PUBLISH_OFFER",
              stage: "sync-latest-description",
              ebayHttp: updateOfferResponse.status,
              ebayResponse: updateOfferText,
            },
            { headers: corsHeaders },
          )
        }
      }

      if (liveListingId) {
        await persistLiveListingLink(
          liveListingId,
        )

        return Response.json(
          {
            success: true,
            mode:
              "UPDATE_LIVE_OFFER",
            offerId,
            listingId:
              liveListingId,
            titleUpdated:
              Boolean(latestTitle),
            descriptionUpdated:
              Boolean(
                latestDescriptionHtml,
              ),
            message:
              "Existing live eBay listing updated successfully.",
          },
          {
            headers: corsHeaders,
          },
        )
      }

      const publishResponse = await fetch(
        `https://api.ebay.com/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Accept-Language": "en-US",
            "Content-Language": "en-US",
          },
        },
      )

      const publishText = await publishResponse.text()

      let publishData: Record<string, unknown> = {}

      try {
        publishData = publishText
          ? JSON.parse(publishText) as Record<string, unknown>
          : {}
      } catch {
        publishData = {}
      }

      if (!publishResponse.ok) {
        return Response.json(
          {
            success: false,
            mode: "PUBLISH_OFFER",
            stage: "publish-offer",
            ebayHttp: publishResponse.status,
            ebayResponse: publishText,
          },
          { headers: corsHeaders },
        )
      }

      const listingId = String(publishData.listingId ?? "")

      if (!listingId) {
        return Response.json(
          {
            success: false,
            mode: "PUBLISH_OFFER",
            stage: "publish-offer",
            error: "eBay published the offer but did not return a listing ID.",
            ebayResponse: publishText,
          },
          { headers: corsHeaders },
        )
      }

      await persistLiveListingLink(
        listingId,
      )

      return Response.json(
        {
          success: true,
          mode: "PUBLISH_OFFER",
          offerId,
          listingId,
          message: "Offer published successfully. Listing is live on eBay.",
        },
        { headers: corsHeaders },
      )
    }

    const part = body.part && typeof body.part === "object"
      ? body.part
      : {}

    const draft = body.draft && typeof body.draft === "object"
      ? body.draft
      : {}

    const category = body.category && typeof body.category === "object"
      ? body.category
      : {}

    const photoUrls = Array.isArray(body.photoUrls)
      ? body.photoUrls
          .filter((value: unknown) => typeof value === "string")
          .map((value: string) => value.trim())
          .filter(Boolean)
      : []

    const policies =
      body.policies && typeof body.policies === "object"
        ? body.policies
        : {}

    const shippingPolicy =
      clean(policies.shipping) || "FREE"

    const returnsPolicy =
      clean(policies.returns) || "RETURNS"

    const shippingAmount =
      clean(policies.shippingAmount)

    const immediatePayment =
      typeof policies.immediatePayment === "boolean"
        ? policies.immediatePayment
        : true

    const sku = clean(part.sku)
    const title = clean(draft.title)

    const description =
      clean(draft.description)

    const descriptionHtml =
      clean(draft.descriptionHtml)

    const listingDescription =
      descriptionHtml ||
      description

    const conditionDescription = clean(draft.conditionDescription)
    const categoryId = clean(category.categoryId)

    const price =
      typeof part.listPrice === "number"
        ? part.listPrice
        : Number(part.listPrice ?? 0)

    const quantity =
      typeof part.quantity === "number"
        ? part.quantity
        : Number(part.quantity ?? 1)

    const brand = clean(part.brand) || "OEM"
    const partNumber = clean(part.partNumber)

    const validationErrors: string[] = []

    if (!sku) validationErrors.push("SKU is required")
    if (!title) validationErrors.push("Listing title is required")
    if (!listingDescription) validationErrors.push("Description is required")
    if (!categoryId) validationErrors.push("eBay category ID is required")
    if (!Number.isFinite(price) || price <= 0) {
      validationErrors.push("List price must be greater than $0")
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      validationErrors.push("Quantity must be at least 1")
    }
    if (photoUrls.length === 0) {
      validationErrors.push("At least one listing photo is required")
    }

    if (!["FREE", "FLAT_RATE", "FREIGHT"].includes(shippingPolicy)) {
      validationErrors.push("Invalid eBay shipping selection")
    }

    if (!["RETURNS", "NO_RETURNS"].includes(returnsPolicy)) {
      validationErrors.push("Invalid eBay returns selection")
    }

    if (shippingPolicy !== "FREE") {
      const amount = Number(shippingAmount)

      if (!Number.isFinite(amount) || amount <= 0) {
        validationErrors.push(
          "Shipping charge must be greater than $0 for buyer-paid or freight shipping",
        )
      }
    }

    const aspects: Record<string, string[]> = {}

    const draftSpecifics =
      draft.itemSpecifics &&
      typeof draft.itemSpecifics === "object"
        ? draft.itemSpecifics
        : {}

    for (const [key, value] of Object.entries(draftSpecifics)) {
      if (typeof value === "string" && value.trim()) {
        aspects[key] = [value.trim()]
      } else if (Array.isArray(value)) {
        const values = value
          .filter((item) => typeof item === "string" && item.trim())
          .map((item) => String(item).trim())

        if (values.length) {
          aspects[key] = values
        }
      }
    }

    if (!aspects["Brand"]) {
      aspects["Brand"] = [brand]
    }

    if (partNumber) {
      if (!aspects["Manufacturer Part Number"]) {
        aspects["Manufacturer Part Number"] = [partNumber]
      }
      if (!aspects["OE/OEM Part Number"]) {
        aspects["OE/OEM Part Number"] = [partNumber]
      }
    }

    if (validationErrors.length > 0) {
      return Response.json(
        {
          success: false,
          mode,
          readyForEbay: false,
          validationErrors,
          message: "Nothing was sent to eBay.",
        },
        { headers: corsHeaders },
      )
    }

    const preview = {
      marketplaceId: "EBAY_MOTORS",
      merchantLocationKey: "texas-oem-main",
      sku,
      title: title.slice(0, 80),
      description,
      listingDescription,
      usesBrandedHtml: Boolean(descriptionHtml),
      categoryId,
      price: {
        value: price.toFixed(2),
        currency: "USD",
      },
      quantity,
      photos: photoUrls,
      aspects,
    }

    if (mode !== "CREATE_DRAFT") {
      return Response.json(
        {
          success: true,
          mode: "PREVIEW_ONLY",
          readyForEbay: true,
          validationErrors: [],
          preview,
          message: "Publisher payload validated. Nothing was sent to eBay.",
        },
        { headers: corsHeaders },
      )
    }

    const accessToken = await getAccessToken()

    let fulfillmentPolicyId =
      EBAY_POLICY_IDS.fulfillment.free

    if (
      shippingPolicy === "FLAT_RATE" ||
      shippingPolicy === "FREIGHT"
    ) {
      const matchedPolicyId =
        await getOrCreateFulfillmentPolicyId(
          accessToken,
          shippingPolicy,
          shippingAmount,
        )

      fulfillmentPolicyId = matchedPolicyId
    }

    const paymentPolicyId =
      immediatePayment
        ? EBAY_POLICY_IDS.payment.immediate
        : EBAY_POLICY_IDS.payment.standard

    const returnPolicyId =
      returnsPolicy === "NO_RETURNS"
        ? EBAY_POLICY_IDS.returns.noReturns
        : EBAY_POLICY_IDS.returns.accepted

    const inventoryPayload = {
      availability: {
        shipToLocationAvailability: {
          quantity,
        },
      },
      condition: "USED_EXCELLENT",
      product: {
        title: title.slice(0, 80),
        description,
        aspects,
        imageUrls: photoUrls,
      },
    }

    const inventoryResponse = await fetch(
      `https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Accept-Language": "en-US",
          "Content-Language": "en-US",
        },
        body: JSON.stringify(inventoryPayload),
      },
    )

    const inventoryText = await inventoryResponse.text()

    if (!inventoryResponse.ok) {
      return Response.json(
        {
          success: false,
          mode: "CREATE_DRAFT",
          stage: "inventory-item",
          ebayHttp: inventoryResponse.status,
          ebayResponse: inventoryText,
        },
        { headers: corsHeaders },
      )
    }

    const offerPayload = {
      sku,
      marketplaceId: "EBAY_MOTORS",
      format: "FIXED_PRICE",
      availableQuantity: quantity,
      categoryId,
      merchantLocationKey: "texas-oem-main",
      listingDescription,
      listingDuration: "GTC",
      pricingSummary: {
        price: {
          value: price.toFixed(2),
          currency: "USD",
        },
      },
      listingPolicies: {
        fulfillmentPolicyId,
        paymentPolicyId,
        returnPolicyId,
      },
    }

    const existingOffersResponse = await fetch(
      `https://api.ebay.com/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept": "application/json",
          "Accept-Language": "en-US",
          "Content-Language": "en-US",
        },
      },
    )

    const existingOffersText = await existingOffersResponse.text()

    let existingOffersData: Record<string, unknown> = {}

    try {
      existingOffersData = existingOffersText
        ? JSON.parse(existingOffersText) as Record<string, unknown>
        : {}
    } catch {
      existingOffersData = {}
    }

    const noExistingOffer =
      existingOffersResponse.status === 404

    if (!existingOffersResponse.ok && !noExistingOffer) {
      return Response.json(
        {
          success: false,
          mode: "CREATE_DRAFT",
          stage: "lookup-existing-offer",
          ebayHttp: existingOffersResponse.status,
          ebayResponse: existingOffersText,
        },
        { headers: corsHeaders },
      )
    }

    const existingOffers =
      !noExistingOffer && Array.isArray(existingOffersData.offers)
        ? existingOffersData.offers as Array<Record<string, unknown>>
        : []

    const existingOffer =
      existingOffers.find((offer) => !offer.listing) ??
      existingOffers[0] ??
      null

    const existingOfferId = clean(existingOffer?.offerId)

    let offerId = ""
    let offerCreated = false
    let offerUpdated = false

    if (existingOfferId) {
      const updateOfferResponse = await fetch(
        `https://api.ebay.com/sell/inventory/v1/offer/${encodeURIComponent(existingOfferId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Accept-Language": "en-US",
            "Content-Language": "en-US",
          },
          body: JSON.stringify(offerPayload),
        },
      )

      const updateOfferText = await updateOfferResponse.text()

      if (!updateOfferResponse.ok) {
        return Response.json(
          {
            success: false,
            mode: "CREATE_DRAFT",
            stage: "update-offer",
            ebayHttp: updateOfferResponse.status,
            ebayResponse: updateOfferText,
          },
          { headers: corsHeaders },
        )
      }

      offerId = existingOfferId
      offerUpdated = true
    } else {
      const offerResponse = await fetch(
        "https://api.ebay.com/sell/inventory/v1/offer",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Accept-Language": "en-US",
            "Content-Language": "en-US",
          },
          body: JSON.stringify(offerPayload),
        },
      )

      const offerText = await offerResponse.text()

      let offerData: Record<string, unknown> = {}

      try {
        offerData = offerText
          ? JSON.parse(offerText) as Record<string, unknown>
          : {}
      } catch {
        offerData = {}
      }

      if (!offerResponse.ok) {
        return Response.json(
          {
            success: false,
            mode: "CREATE_DRAFT",
            stage: "offer",
            ebayHttp: offerResponse.status,
            ebayResponse: offerText,
          },
          { headers: corsHeaders },
        )
      }

      offerId = String(offerData.offerId ?? "")
      offerCreated = true
    }

    return Response.json(
      {
        success: true,
        mode: "CREATE_DRAFT",
        inventoryItemCreated: true,
        offerCreated,
        offerUpdated,
        offerId,
        sku,
        categoryId,
        price: price.toFixed(2),
        message: offerUpdated
          ? "Existing eBay offer updated. Nothing is live yet."
          : "eBay inventory item and unpublished offer created. Nothing is live yet.",
      },
      { headers: corsHeaders },
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500, headers: corsHeaders },
    )
  }
})
