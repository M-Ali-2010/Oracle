import { AppProps } from 'next/app';
import Head from 'next/head';
import { FC } from 'react';
import { ContextProvider } from '../contexts/ContextProvider';
import { AppBar } from '../components/AppBar';
import { ContentContainer } from '../components/ContentContainer';
import Notifications from '../components/Notification';

import '@solana/wallet-adapter-react-ui/styles.css';
import '../styles/globals.css';

const App: FC<AppProps> = ({ Component, pageProps }) => {
  return (
    <>
      <Head>
        <title>Oracle-Pro · Trading Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="description" content="Oracle-Pro — Solana Wallet + AI Trading" />
      </Head>

      <ContextProvider>
        <div className="flex min-h-screen flex-col bg-[#080C17] pt-14">
          <Notifications />
          <AppBar />
          <ContentContainer>
            <Component {...pageProps} />
          </ContentContainer>
        </div>
      </ContextProvider>
    </>
  );
};

export default App;
