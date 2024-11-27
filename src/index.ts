import Moralis from 'moralis';
import express from 'express';
import cors from 'cors';
import config from './config';
import { parseServer } from './parseServer';
// @ts-ignore
import ParseServer from 'parse-server';
import http from 'http';
import ngrok from 'ngrok';
import mongoose from 'mongoose';
import { streamsSync } from '@moralisweb3/parse-server';
import { EvmChain } from "@moralisweb3/common-evm-utils";
import aiskinsFactoryAbi from './abi/aiskinsFactoryAbi'
import aiskinsMasterCollection from './abi/aiskinsMasterCollectionAbi'

export const app = express();

Moralis.start({
  apiKey: config.MORALIS_API_KEY,
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(cors());

app.use(
  streamsSync(parseServer, {
    apiKey: config.MORALIS_API_KEY,
    webhookUrl: config.STREAMS_WEBHOOK_URL,
  }),
);

app.use(`/server`, parseServer.app);

const httpServer = http.createServer(app);

httpServer.listen(config.PORT, async () => {
  if (config.USE_STREAMS) {
    let url 
    if (config.ENV === 'LOCAL') {
      url = await ngrok.connect(config.PORT);
    }

    await mongoose.connect(`${config.DATABASE_URI}`);

    try {
      const streams = await Moralis.Streams.getAll({
        limit: 100,
      });
  
      if (!streams.toJSON().result.find(stream => stream.tag === 'activity')) {
        const stream = {
          chains: [EvmChain.MUMBAI],
          description: "To track events from AISkins Factory and Collection",
          tag: "activity",
          webhookUrl: `${config.ENV === 'LOCAL' ? url : config.SERVER_NAME}${config.STREAMS_WEBHOOK_URL}`,
          includeNativeTxs: true,
          includeContractLogs: true,
          abi: [...aiskinsFactoryAbi, ...aiskinsMasterCollection],
          topic0: [
            "CreateCollection(address,address,string,string,uint256)",
            "TransferSingle(address,address,address,uint256,uint256)",
            "TransferBatch(address,address,address,uint256[],uint256[])",
            "MintItem(address,address,address,uint256,uint256,uint256)", 
            "CreateItem(uint256,address,uint256,uint256,bool)",
          ],
        };
  
        const newStream = await Moralis.Streams.add(stream);
  
        const { id } = newStream.toJSON();
  
        await Moralis.Streams.addAddress({
          id,
          address: [
            config.AISKINS_FACTORY_ADDRESS,
            config.AISKINS_MASTER_COLLECTION_ADDRESS,
          ],
        });

        console.log(`Stream ${id} created.`)
      } else {
        let chain = EvmChain.MUMBAI
        if (config.EVM_CHAIN === 'polygon') {
          chain = EvmChain.POLYGON
        }
        await Moralis.Streams.update({
          chains: [chain],
          id: config.STREAMS_ID,
          webhookUrl: `${config.ENV === 'LOCAL' ? url : config.SERVER_NAME}${config.STREAMS_WEBHOOK_URL}`
        })

        console.log(`Stream updated with webhook: ${url}${config.STREAMS_WEBHOOK_URL}`)
      }

      console.log(
        `Moralis Server is running on port ${config.PORT} and stream webhook url ${url}${config.STREAMS_WEBHOOK_URL}`,
      );

    } catch (error) {
      console.error(error.message)
    }

  } else {
    console.log(`Moralis Server is running on port ${config.PORT}.`);
  }
});
// This will enable the Live Query real-time server
ParseServer.createLiveQueryServer(httpServer);
