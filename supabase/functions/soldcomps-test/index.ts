Deno.serve(async () => {
  try {
    const apiKey = Deno.env.get("SOLDCOMPS_API_KEY") ?? ""

    if (!apiKey) {
      return Response.json(
        { success: false, error: "Missing SOLDCOMPS_API_KEY" },
        { status: 500 },
      )
    }

    const url = new URL("https://api.sold-comps.com/v1/scrape")
    url.searchParams.set("keyword", "84361173")
    url.searchParams.set("ebaySite", "ebay.com")
    url.searchParams.set("page", "1")
    url.searchParams.set("count", "240")
    url.searchParams.set("daysToScrape", "90")
    url.searchParams.set("sortOrder", "endedRecently")

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return Response.json(
        {
          success: false,
          http: response.status,
          error: data,
        },
        { status: 500 },
      )
    }

    const items = Array.isArray(data.items) ? data.items : []

    const sold = items.filter(
      (item: any) =>
        item.listingType === "sold" &&
        item.soldPrice &&
        item.endedAt,
    )

    return Response.json({
      success: true,
      keyword: "84361173",
      returned: items.length,
      soldCount: sold.length,
      sample: sold.slice(0, 5).map((item: any) => ({
        title: item.title,
        soldPrice: item.soldPrice,
        shippingPrice: item.shippingPrice,
        endedAt: item.endedAt,
        condition: item.condition,
      })),
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: String(error),
      },
      { status: 500 },
    )
  }
})
