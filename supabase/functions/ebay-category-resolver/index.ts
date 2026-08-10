const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const clientId = Deno.env.get("EBAY_CLIENT_ID") ?? ""
    const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET") ?? ""

    if (!clientId || !clientSecret) {
      throw new Error("Missing eBay application credentials")
    }

    const body = await req.json().catch(() => ({}))
    const query = String(body.query ?? "").trim()

    if (!query) {
      return Response.json(
        { success: false, error: "Missing category search query" },
        { status: 400, headers: corsHeaders },
      )
    }

    const credentials = btoa(`${clientId}:${clientSecret}`)

    const tokenBody = new URLSearchParams()
    tokenBody.set("grant_type", "client_credentials")
    tokenBody.set(
      "scope",
      "https://api.ebay.com/oauth/api_scope",
    )

    const tokenResponse = await fetch(
      "https://api.ebay.com/identity/v1/oauth2/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenBody,
      },
    )

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok || !tokenData.access_token) {
      return Response.json(
        {
          success: false,
          stage: "token",
          ebayHttp: tokenResponse.status,
          ebayResponse: tokenData,
        },
        { status: 500, headers: corsHeaders },
      )
    }

    const treeData = {
      categoryTreeId: "100",
      categoryTreeVersion: "EBAY_MOTORS",
    }

    const categoryUrl = new URL(
      `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${treeData.categoryTreeId}/get_category_suggestions`,
    )
    categoryUrl.searchParams.set("q", query)

    const categoryResponse = await fetch(categoryUrl, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    const categoryData = await categoryResponse.json()

    if (!categoryResponse.ok) {
      return Response.json(
        {
          success: false,
          stage: "category-suggestions",
          ebayHttp: categoryResponse.status,
          ebayResponse: categoryData,
        },
        { status: 500, headers: corsHeaders },
      )
    }

    const suggestions = Array.isArray(categoryData.categorySuggestions)
      ? categoryData.categorySuggestions.slice(0, 5).map((item: any) => ({
          categoryId: item.category?.categoryId ?? "",
          categoryName: item.category?.categoryName ?? "",
          ancestors: Array.isArray(item.categoryTreeNodeAncestors)
            ? item.categoryTreeNodeAncestors.map((ancestor: any) => ({
                categoryId: ancestor.category?.categoryId ?? "",
                categoryName: ancestor.category?.categoryName ?? "",
              }))
            : [],
        }))
      : []

    const bestMatch = suggestions[0] ?? null

    let aspects = []

    if (bestMatch?.categoryId) {
      const aspectsResponse = await fetch(
        `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${treeData.categoryTreeId}/get_item_aspects_for_category?category_id=${bestMatch.categoryId}`,
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        },
      )

      if (aspectsResponse.ok) {
        const aspectsData = await aspectsResponse.json()

        aspects = Array.isArray(aspectsData.aspects)
          ? aspectsData.aspects.map((item: any) => ({
              name: item.localizedAspectName ?? "",
              required:
                item.aspectConstraint?.aspectRequired === true,
              mode:
                item.aspectConstraint?.aspectMode ?? "",
              dataType:
                item.aspectConstraint?.aspectDataType ?? "",
              usage:
                item.aspectConstraint?.aspectUsage ?? "",
              values: Array.isArray(item.aspectValues)
                ? item.aspectValues
                    .slice(0, 25)
                    .map((value: any) => value.localizedValue ?? "")
                    .filter(Boolean)
                : [],
            }))
          : []
      }
    }

    return Response.json(
      {
        success: true,
        query,
        categoryTreeId: treeData.categoryTreeId,
        categoryTreeVersion: categoryData.categoryTreeVersion ?? "",
        bestMatch,
        suggestions,
        aspects,
      },
      { headers: corsHeaders },
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: corsHeaders },
    )
  }
})
