export const getLedgerWallet = async () => {
  const { LedgerWalletAdapter } = await import('@solana/wallet-adapter-ledger');
  return new LedgerWalletAdapter({
    derivationPath: "44'/501'/0'/0'",
  });
};
