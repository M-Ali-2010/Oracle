import type { NextPage } from "next";
import Head from "next/head";
import { HomeView } from "../views";

const Home: NextPage = (props) => {
  return (
    <div>
      <Head>
        <title>Oracle-Pro</title>
        <meta
          name="description"
          content="Oracle-Pro"
        />
      </Head>
      <HomeView />
    </div>
  );
};

export default Home;
