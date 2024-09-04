import mongoose, { isValidObjectId } from "mongoose"
import {Tweet} from "../models/tweet.model.js"
import {User} from "../models/user.model.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/APIError.js"
import { ApiResponse } from "../utils/ApiResoponse.js"

const createTweet = asyncHandler(async (req, res) => {
    //TODO: create tweet
    const {content}=req.body;
    if(!content){
        throw new ApiError(400,"content is required")
    }
    
    const tweet=await Tweet.create({
        content,
        owner: req.user?._id
    })

    if(!tweet){
        throw new ApiError(400,"error while saving tweet")
    }

    return res.status(200).json(new ApiResponse(200,tweet,"tweeted successfully"))

})

const getUserTweets = asyncHandler(async (req, res) => {
    // TODO: get user tweets
    const {userId} = req.params;
    if ( !isValidObjectId( userId ) ) { throw new ApiError( 400, "Invalid USerId" ) }

    const userTweet = await Tweet.find( {
        owner: new mongoose.Types.ObjectId( userId )
    } )

    if ( userTweet.length === 0 ) { return new ApiError( 500, "No tweet found!" ) }

    return res.status( 200 )
    .json( new ApiResponse( 200, { "Total_Tweets": userTweet.length, "Tweet": userTweet }, "Tweets found!" ) )
})

const updateTweet = asyncHandler(async (req, res) => {
    //TODO: update tweet
    const {tweetId}= req.params;
    const {content}= req.body;
    if ( !isValidObjectId( tweetId ) ) { throw new ApiError( 400, "Invalid tweet id" ) }
    if(!content){
        throw new ApiError(400,"content is required")
    }
    const findTweet=await Tweet.findOne({
        $and: [ { owner: new mongoose.Types.ObjectId( req.user?._id ) }, { _id: tweetId } ]
    })

    if ( !findTweet ) { throw new ApiError( 400, "You are not authorized to update this tweet" ) }

    findTweet.content=content;
    const updatedTweet = await findTweet.save()

    if ( !updatedTweet ) { throw new ApiError( 500, "Tweet not updated!" ) }

    return res.status( 200 )
        .json( new ApiResponse( 200, updatedTweet, "Tweet updated successfully" ) )
    
    
})

const deleteTweet = asyncHandler(async (req, res) => {
    //TODO: delete tweet
    const {tweetId}= req.params;
    if ( !isValidObjectId( tweetId ) ) { throw new ApiError( 400, "Invalid tweet id" ) }
    
    const findTweet=await Tweet.findOne({
        $and: [ { owner: new mongoose.Types.ObjectId( req.user?._id ) }, { _id: tweetId } ]
    })

    if ( !findTweet ) { throw new ApiError( 400, "You are not authorized to delete this tweet" ) }

    const delTweet = await Tweet.findByIdAndDelete( tweetId )

    if ( !delTweet ) { throw new ApiError( 500, "Tweet not deleted!" ) }

    return res.status( 200 )
        .json( new ApiResponse( 200, delTweet, "Tweet deleted successfully!" ) )
})

export {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
}