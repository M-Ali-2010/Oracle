export default async function handler(req, res) {
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true'
    )

    const data = await r.json()

    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ error: 'failed to fetch price' })
  }
}