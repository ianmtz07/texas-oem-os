import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function normalizePartNumber(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^[#:\-_.\s]+|[#:\-_.\s]+$/g, "")
}

function canonicalPair(
  sourcePartNumber: string,
  candidatePartNumber: string,
) {
  return [sourcePartNumber, candidatePartNumber]
    .sort((a, b) => a.localeCompare(b))
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    )
  }

  try {
    const body =
      await req.json().catch(() => ({}))

    const sourcePartNumber =
      normalizePartNumber(
        body.sourcePartNumber ??
          body.source_part_number,
      )

    const candidatePartNumber =
      normalizePartNumber(
        body.candidatePartNumber ??
          body.candidate_part_number,
      )

    const action =
      String(
        body.action ?? "",
      )
        .trim()
        .toLowerCase()

    const dryRun =
      body.dryRun === true ||
      body.dry_run === true

    const notes =
      String(body.notes ?? "").trim()

    if (!sourcePartNumber) {
      throw new Error(
        "Missing source part number",
      )
    }

    if (!candidatePartNumber) {
      throw new Error(
        "Missing candidate part number",
      )
    }

    if (
      sourcePartNumber ===
      candidatePartNumber
    ) {
      throw new Error(
        "Source and candidate part numbers cannot match",
      )
    }

    if (
      action !== "approve" &&
      action !== "reject"
    ) {
      throw new Error(
        "Action must be approve or reject",
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
        "Missing Supabase service configuration",
      )
    }

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey,
      )

    const [partNumberA, partNumberB] =
      canonicalPair(
        sourcePartNumber,
        candidatePartNumber,
      )

    /*
     * Confirm the candidate actually exists.
     */
    const {
      data: candidateRows,
      error: candidateError,
    } = await supabase
      .from("interchange_candidates")
      .select(
        "id, source_part_number, candidate_part_number, confidence, evidence_count, status",
      )
      .eq(
        "source_part_number",
        sourcePartNumber,
      )
      .eq(
        "candidate_part_number",
        candidatePartNumber,
      )
      .order(
        "created_at",
        { ascending: false },
      )

    if (candidateError) {
      throw candidateError
    }

    if (
      !candidateRows ||
      candidateRows.length === 0
    ) {
      throw new Error(
        "Interchange candidate was not found",
      )
    }

    const latestCandidate =
      candidateRows[0]

    /*
     * DRY RUN:
     * Validate everything, but make no database changes.
     */
    if (dryRun) {
      return new Response(
        JSON.stringify(
          {
            success: true,
            dry_run: true,
            action,
            source_part_number:
              sourcePartNumber,
            candidate_part_number:
              candidatePartNumber,
            canonical_pair: {
              part_number_a:
                partNumberA,
              part_number_b:
                partNumberB,
            },
            candidate: {
              confidence:
                latestCandidate.confidence,
              evidence_count:
                latestCandidate.evidence_count,
              current_status:
                latestCandidate.status,
            },
            message:
              action === "approve"
                ? "Approval validation passed. No changes were made."
                : "Rejection validation passed. No changes were made.",
          },
          null,
          2,
        ),
        {
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        },
      )
    }

    /*
     * APPROVE
     */
    if (action === "approve") {
      const {
        data: existingVerified,
        error: existingError,
      } = await supabase
        .from("verified_interchanges")
        .select(
          "id, part_number_a, part_number_b, approved_at",
        )
        .eq(
          "part_number_a",
          partNumberA,
        )
        .eq(
          "part_number_b",
          partNumberB,
        )
        .maybeSingle()

      if (existingError) {
        throw existingError
      }

      let verifiedRow =
        existingVerified

      if (!verifiedRow) {
        const {
          data: inserted,
          error: insertError,
        } = await supabase
          .from(
            "verified_interchanges",
          )
          .insert({
            part_number_a:
              partNumberA,
            part_number_b:
              partNumberB,
            approved_by: "owner",
            notes:
              notes || null,
          })
          .select(
            "id, part_number_a, part_number_b, approved_at, notes",
          )
          .single()

        if (insertError) {
          throw insertError
        }

        verifiedRow = inserted
      }

      const {
        error: updateError,
      } = await supabase
        .from(
          "interchange_candidates",
        )
        .update({
          status: "approved",
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "source_part_number",
          sourcePartNumber,
        )
        .eq(
          "candidate_part_number",
          candidatePartNumber,
        )

      if (updateError) {
        throw updateError
      }

      return new Response(
        JSON.stringify(
          {
            success: true,
            action: "approved",
            source_part_number:
              sourcePartNumber,
            candidate_part_number:
              candidatePartNumber,
            verified_interchange:
              verifiedRow,
            message:
              "Interchange approved and added to the verified Texas OEM library.",
          },
          null,
          2,
        ),
        {
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        },
      )
    }

    /*
     * REJECT
     */
    const {
      error: rejectError,
    } = await supabase
      .from(
        "interchange_candidates",
      )
      .update({
        status: "rejected",
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "source_part_number",
        sourcePartNumber,
      )
      .eq(
        "candidate_part_number",
        candidatePartNumber,
      )

    if (rejectError) {
      throw rejectError
    }

    return new Response(
      JSON.stringify(
        {
          success: true,
          action: "rejected",
          source_part_number:
            sourcePartNumber,
          candidate_part_number:
            candidatePartNumber,
          message:
            "Interchange candidate rejected.",
        },
        null,
        2,
      ),
      {
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      },
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error)

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      },
    )
  }
})
