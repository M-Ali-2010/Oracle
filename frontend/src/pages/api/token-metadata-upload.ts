import type { NextApiRequest, NextApiResponse } from 'next';
import { NFTStorage, File } from 'nft.storage';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

type Body = {
  name?: string;
  symbol?: string;
  description?: string;
  imageBase64?: string;
  imageMime?: string;
};

/** Uploads logo + JSON metadata to IPFS via nft.storage (requires NFT_STORAGE_TOKEN in env). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.NFT_STORAGE_TOKEN;
  if (!token) {
    return res.status(503).json({
      error:
        'NFT_STORAGE_TOKEN is not set. Get a free API key from https://nft.storage and add it to your server environment.',
    });
  }

  const { name, symbol, description, imageBase64, imageMime } = req.body as Body;

  try {
    const client = new NFTStorage({ token });
    const png1 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const buf = imageBase64 ? Buffer.from(imageBase64, 'base64') : Buffer.from(png1, 'base64');
    const imageFile = new File([buf], 'logo.png', {
      type: imageMime && imageMime.startsWith('image/') ? imageMime : 'image/png',
    });

    const metadata = await client.store({
      name: String(name ?? 'Token').slice(0, 32),
      symbol: String(symbol ?? 'TKN').slice(0, 10),
      description: String(description ?? '').slice(0, 500),
      image: imageFile,
    });

    const uri =
      typeof metadata.url === 'string'
        ? metadata.url.replace(/^ipfs:\/\//, 'https://nftstorage.link/ipfs/')
        : '';

    if (!uri) {
      return res.status(500).json({ error: 'IPFS upload returned no URI' });
    }

    return res.status(200).json({ uri });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    return res.status(500).json({ error: msg });
  }
}
