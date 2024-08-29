import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/APIError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloud} from "../utils/cloudnary.js"
import { ApiResponse } from "../utils/ApiResoponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRRefreshToken= async(userId)=>{
    try {
        const user=await User.findById(userId)
        const accessToken=user.generateAccessToken()
        const refreshToken=user.generateRefreshToken()
        user.refreshToken=refreshToken
        await user.save({validateBeforeSave: false})    

        return {accessToken,refreshToken}
        
    } catch (error) {
        throw new ApiError(500,"error while genrating refresh and access token")
    }
}

const registerUser=  asyncHandler( async (req,res)=>{
    const {fullname, email,username, password}=req.body
    // console.log("email: ",email) 

    if([fullname,email,username,password].some((field)=>field?.trim()==="")){
        throw new ApiError(400,"all fiels are required")
    }

    const existedUser= await User.findOne({
        $or:[{username},{email}]
    })
    if(existedUser){
        throw new ApiError(409,"User with email or username already exist")
    }

    // console.log(req.file)
    const avatarLocalPath = req.files?.avatar[0]?.path
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length>0){
        coverImageLocalPath=req.files.coverImage[0].path;

    }
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar is reqired")
    }

    const avatar= await uploadOnCloud(avatarLocalPath)
    const coverImage= await uploadOnCloud(coverImageLocalPath)

    if(!avatar){
        throw new ApiError(400,"Avatar is reqired")
    }

    const user= await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser=await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(500,"something went wrong while registering user")
    }



    return res.status(201).json(
        new ApiResponse(200, createdUser,"user registed successfully")
    )



})

const loginUser= asyncHandler(async (req,res)=>{
    //req.body->data
    //username or email
    //check if user exist
    //check pass
    //access and refresh token
    //send cookies

    const {email,username,password}=req.body
    console.log(email);

    if(!username && !email){
        throw new ApiError(400,"username or email is required")
    }

    const user= await User.findOne({
        $or:[{username},{email}]
    })

    if(!user){
        throw new ApiError(404,"user does not exist")
    }

    const isPassValid= await user.isPasswordCorrect(password)

    if(!isPassValid){
        throw new ApiError(401,"invalid user credentials")
    }

    const {accessToken,refreshToken} = await generateAccessAndRRefreshToken(user._id)

    const loggedInUser=await User.findById(user._id).select("-password -refreshToken")

    const options={
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(
            200,
            {
                user:loggedInUser,
                accessToken,
                refreshToken
            },
            "User Logged in successfully"
        )
    )
    

})

const logoutUser= asyncHandler(async(req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken: 1
            }
        },
        {
            new: true
        }
    )
    const options={
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new ApiResponse(200,{},"User logged out"))
})

const refreshAccessToken = asyncHandler(async(req,res)=>{
    const incomingRefreshToken= req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401, "unauthorized request")
    }

    try {
        const decodedToken= jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user= await User.findById(decodedToken?._id)
        if(!user){
            throw new ApiError(401, "invalid refresh token")
        }
    
        if (incomingRefreshToken!==user?.refreshToken) {
            throw new ApiError(401, "refresh token is expired")    
        }
    
        const options={
            httpOnly: true,
            secure: true
        }
    
        const {accessToken,newRefreshToken}=await generateAccessAndRRefreshToken(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options )
        .json(
            new ApiResponse(
                200,
                {accessToken,refreshToken:newRefreshToken},
                "access token refreshed successfully"
            )
        )
    } catch (error) {
        throw new ApiError(401,error?.message || "invalid refresh token")
    }

})

const changeCurrentPassword= asyncHandler(async(req,res)=>{
    const {oldPassword, newPassword}= req.body

    const user= await User.findById(req.user?._id)
    const isPassCorrect= await user.isPasswordCorrect(oldPassword)

    if(!isPassCorrect){
        throw new ApiError(400,"Invalid password")
    }

    user.password=newPassword
    await user.save({validateBeforeSave: false})

    return res.status(200)
    .json(new ApiResponse(200,{},"pass changes successfully"))
})

const getCurrentUser= asyncHandler(async(req,res)=>{
    return res.status(200).json(new ApiResponse(200, req.user,"current user fetched"))
})

const updateAccountDetails= asyncHandler(async(req,res)=>{
    const {fullName, email}= req.body

    if(!fullName || !email){
        throw new ApiError(400,"all fields are required")
    }

    const user= await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullName: fullName,
                email:email
            }
        },
        {new : true}
    ).select("-password")

    return res.status(200).json(new ApiResponse(200,user,"account details updated successfullly"))
})

const updateUserAvatar= asyncHandler(async(req,res)=>{
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar is reqired")
    }

    const avatar= await uploadOnCloud(avatarLocalPath)

    if(!avatar.url){
        throw new ApiError(400,"error while uploadin on cloud")
    }

    const user= await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar:avatar.url
            }
        },
        {new : true}
    ).select("-password")

    return res.status(200).json(new ApiResponse(200,user,"avatar updated successfullly"))
})

const updateUserCoverImage= asyncHandler(async(req,res)=>{
    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath){
        throw new ApiError(400,"cover image file is reqired")
    }

    const coverImage= await uploadOnCloud(coverImageLocalPath)

    if(!coverImage.url){
        throw new ApiError(400,"error while uploadin on cloud")
    }

    const user= await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage:coverImage.url
            }
        },
        {new : true}
    ).select("-password")

    return res.status(200).json(new ApiResponse(200,user,"cover image updated successfullly"))
})

const getUserChannelProfile = asyncHandler(async(req,res)=>{
    console.log("hello")
    const {username}= req.params
    if(!username?.trim()){
        throw new ApiError(400,"username is missing")
    }

    const channel= await User.aggregate([
        {
            $match:{
                username:username?.toLowerCase()
            }
        },
        {
            $lookup:{
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup:{
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields:{
                subscribersCount:{
                    $size:"$subscribers"
                },
                channelsSubscribedToCount:{
                    $size:"$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if:{$in:[req.user?._id,"$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project:{
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar:1,
                coverImage:1,
                email:1

            }
        }
    ])

    if(!channel?.length){
        throw new ApiError(404,"channel does not exist")
    }

    return res.status(200).json(new ApiResponse(200,channel[0],"user channel fetched successfully"))
})

const getWatchHistory = asyncHandler(async(req,res)=>{
    const user= await User.aggregate([
        {
            $match:{
                _id:new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup:{
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline:[
                    {
                        $lookup:{
                            from : "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project:{
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner:{
                                $first: "$owner"
                            }
                        }
                    }
                ]

            }
        }
    ])

    return res.status(200).json(new ApiResponse(200,user[0].watchHistory,"watch history fetched successfully"))
})


export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}