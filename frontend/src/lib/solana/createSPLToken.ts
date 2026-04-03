import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  AuthorityType,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddress,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';
import {
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
  createCreateMetadataAccountV3Instruction,
} from '@metaplex-foundation/mpl-token-metadata';

function metadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

export interface CreateTokenParams {
  connection: Connection;
  payer: PublicKey;
  /** Mint keypair — must sign the mint+mint-to transaction. */
  mintKeypair: Keypair;
  decimals: number;
  /** Human-readable supply (integer part; avoid floats). */
  supplyRaw: bigint;
  /** Required for Metaplex metadata transaction. */
  metadataUri?: string;
  name: string;
  symbol: string;
  revokeMintAuthority?: boolean;
}

/** Build tx: create mint, ATA, mint full supply. */
export async function buildMintAndSupplyTransaction(
  params: CreateTokenParams
): Promise<Transaction> {
  const {
    connection,
    payer,
    mintKeypair,
    decimals,
    supplyRaw,
  } = params;

  if (supplyRaw <= BigInt(0)) throw new Error('Supply must be greater than 0');
  if (decimals < 0 || decimals > 9) throw new Error('Decimals must be 0–9');

  const lamports = await getMinimumBalanceForRentExemptMint(connection);
  const ata = await getAssociatedTokenAddress(mintKeypair.publicKey, payer, false, TOKEN_PROGRAM_ID);

  const tx = new Transaction();
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mintKeypair.publicKey,
      decimals,
      payer,
      null,
      TOKEN_PROGRAM_ID
    ),
    createAssociatedTokenAccountInstruction(
      payer,
      ata,
      payer,
      mintKeypair.publicKey,
      TOKEN_PROGRAM_ID
    ),
    createMintToInstruction(
      mintKeypair.publicKey,
      ata,
      payer,
      supplyRaw,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;

  return tx;
}

/** Build tx: Metaplex metadata + optional mint authority revoke. */
export function buildMetadataTransaction(params: CreateTokenParams): Transaction {
  const { payer, mintKeypair, metadataUri = '', name, symbol, revokeMintAuthority = true } = params;

  const metadata = metadataPda(mintKeypair.publicKey);
  const dataName = name.slice(0, 32);
  const dataSymbol = symbol.slice(0, 10);
  const uri = metadataUri.slice(0, 200);
  if (!uri.trim()) throw new Error('metadataUri required for metadata transaction');

  const tx = new Transaction();
  tx.add(
    createCreateMetadataAccountV3Instruction(
      {
        metadata,
        mint: mintKeypair.publicKey,
        mintAuthority: payer,
        payer,
        updateAuthority: payer,
      },
      {
        createMetadataAccountArgsV3: {
          data: {
            name: dataName,
            symbol: dataSymbol,
            uri,
            sellerFeeBasisPoints: 0,
            creators: null,
            collection: null,
            uses: null,
          },
          isMutable: true,
          collectionDetails: null,
        },
      }
    )
  );

  if (revokeMintAuthority) {
    tx.add(
      createSetAuthorityInstruction(
        mintKeypair.publicKey,
        payer,
        AuthorityType.MintTokens,
        null,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }

  return tx;
}

export async function finalizeMetadataTransaction(
  connection: Connection,
  tx: Transaction,
  payer: PublicKey
): Promise<void> {
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;
}

/** When skipping Metaplex metadata, still revoke mint authority (fixed supply). */
export async function buildRevokeMintAuthorityTransaction(
  connection: Connection,
  mint: PublicKey,
  payer: PublicKey
): Promise<Transaction> {
  const tx = new Transaction().add(
    createSetAuthorityInstruction(mint, payer, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID)
  );
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;
  return tx;
}
