/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
declare const Parse: typeof import('parse');
import './generated/evmApi';
import './generated/solApi';
import { requestMessage } from '../auth/authService';
import config from '../config';
import mongoose from 'mongoose'

const publishedAssetSchema = new mongoose.Schema({
  _id: String,
  token_id: Number, 
  collection_name: String,
  collection_address: String,
  asset_name: String,
  published: Boolean,
  publish_init_date: Date,
  published_date: Date,
  minting_token: String,
  price: Number,
  creator_address: String,
  quantity: Number,
  limited: Boolean,
  minted: Number,
  thumbnail: String,
  contest_id: String
});
const publishedAssetModel = mongoose.model('publishedassets', publishedAssetSchema);

const publishedCollectionSchema = new mongoose.Schema({
  symbol: String,
  collection_name: String,
  collection_address: String,
  creator_address: String
});
const publishedCollectionModel = mongoose.model('publishedcollections', publishedCollectionSchema);

const mintedAssetSchema = new mongoose.Schema({
  operator_address: String,
  receiver_address: String,
  creator_address: String,
  token_id: Number,
  price: Number,
  amount: Number,
  minted_date: Date,
});
const mintedAssetModel = mongoose.model('mintedassets', mintedAssetSchema);

const contestEntrySchema = new mongoose.Schema({
  contest_entry: String,
  contest_id: String,
  user_id: String,
  is_winning_entry: Boolean,
  ranking: Number,
  published: Boolean,
  token_id: Number
})
const contestEntryModel = mongoose.model('contestentries', contestEntrySchema);

const userActivitySchema = new mongoose.Schema({
  type: String,
  asset_name: String,
  token_id: String,
  collection_name: String,
  creator: String,
  ranking: Number,
  mint_price: String,
  minting_token: String,
  limited: Boolean,
  thumbnail: String,
  timestamp: String,
  user_address: String
})
const userActivityModel = mongoose.model('useractivities', userActivitySchema);

const whitelistedUserSchema = new mongoose.Schema({
  address: String,
  pass: Number
})
const whitelistedUserModel = mongoose.model('whitelistedusers', whitelistedUserSchema);

const contestParticipantSchema = new mongoose.Schema({
  contest_id: String,
  user_id: String,
  free_entries: Number
})
const contestParticipantModel = mongoose.model('contestparticipants', contestParticipantSchema);

const userSchema = new mongoose.Schema({
  _id: String,
  address: String
})
const userModel = mongoose.model('user', userSchema);

Parse.Cloud.beforeSave('ActivityLogs', async (request) => {
  const tokenId = request.object.get('tokenId')
  request.object.set(parseInt(tokenId))
})

Parse.Cloud.afterSave("ActivityLogs", async (request: any) => {
  if(!request.original) {
    
    if(request.object.get('name') === 'CreateCollection') {
      await publishedCollectionModel.create({
        symbol: request.object.get('symbol'),
        collection_name: request.object.get('collectionName'),
        collection_address: request.object.get('collectionAddress'),
        creator_address: request.object.get('creator')
      })

      await userActivityModel.create({
        type: 'Published Collection',
        collection_name: request.object.get('collectionName'),
        creator: request.object.get('creator'),
        timestamp: new Date(),
        user_address: request.object.get('creator')
      })
    } else if (request.object.get('name') === 'CreateItem') {
      await publishedAssetModel.findOneAndUpdate({token_id: Number(request.object.get('tokenId'))}, {$set:{
        published: true,
        published_date: new Date(Number(request.object.get('blockTimestamp')) * 1000)
      }})

      const publishedAsset = await publishedAssetModel.findOne({token_id: Number(request.object.get('tokenId'))})
      await userActivityModel.create({
        type: 'Published Design',
        asset_name: publishedAsset?.asset_name,
        token_id: Number(request.object.get('tokenId')),
        collection_name: publishedAsset?.collection_name,
        creator: publishedAsset?.creator_address,
        mint_price: request.object.get('priceInWei'),
        minting_token: publishedAsset?.minting_token,
        limited: request.object.get('limited'),
        thumbnail: publishedAsset?.thumbnail,
        timestamp: new Date(),
        user_address: publishedAsset?.creator_address
      })
    } else if(request.object.get('name') === 'TransferSingle' && request.object.get('from') === '0x0000000000000000000000000000000000000000' && request.object.get('address').toLowerCase() === config.AISKINS_MASTER_COLLECTION_ADDRESS.toLowerCase()) {
      const userAddress = request.object.get('to').toLowerCase()
      await mintedAssetModel.create({
        operator_address: request.object.get('operator'),
        receiver_address: userAddress,
        token_id: Number(request.object.get('tokenId')),
        amount: Number(request.object.get('amount')),
        minted_date: new Date(Number(request.object.get('blockTimestamp')) * 1000)
      })

      await contestEntryModel.findOneAndUpdate(
        { token_id: Number(request.object.get('tokenId')) },
        { $set: { published: true } }
      ) 

      const publishedAsset = await publishedAssetModel.findOneAndUpdate(
        { token_id: Number(request.object.get('tokenId')) },
        { $inc: { minted: Number(request.object.get('amount')) } },
        { returnOriginal: false } )

      await userActivityModel.create({
        type: 'Minted Design',
        asset_name: publishedAsset?.asset_name,
        token_id: Number(request.object.get('tokenId')),
        collection_name: publishedAsset?.collection_name,
        creator: publishedAsset?.creator_address,
        mint_price: request.object.get('priceInWei'),
        minting_token: publishedAsset?.minting_token,
        limited: publishedAsset?.limited,
        thumbnail: publishedAsset?.thumbnail,
        timestamp: new Date(),
        user_address: request.object.get('to')
      })

      if (publishedAsset?.contest_id) {
        const user = await userModel.findOne({ address: userAddress })
        if (user) {
          await contestParticipantModel.findOneAndUpdate(
            { contest_id: publishedAsset.contest_id },
            { user_id: user._id.toString() },
            { $inc: { free_entries: -1 } }
          )
        }
      } else {
        await whitelistedUserModel.findOneAndUpdate(
          { address: userAddress },
          { $inc: { pass: -1 } }
        )
      }
    }
  }
})

Parse.Cloud.define('requestMessage', async ({ params }: any) => {
  const { address, chain, networkType } = params;

  const message = await requestMessage({
    address,
    chain,
    networkType,
  });

  return { message };
});

Parse.Cloud.define('getPluginSpecs', () => {
  // Not implemented, only excists to remove client-side errors when using the moralis-v1 package
  return [];
});

Parse.Cloud.define('getServerTime', () => {
  // Not implemented, only excists to remove client-side errors when using the moralis-v1 package
  return null;
});
