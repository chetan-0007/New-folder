import mongoose, {isValidObjectId} from "mongoose"
import {Video} from "../models/video.model.js"
import {User} from "../models/user.model.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/APIError.js"
import { uploadOnCloud } from "../utils/cloudnary.js"
import { ApiResponse } from "../utils/ApiResoponse.js"

const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query = "", sortBy = "createdAt", sortType = 1, userId = "" } = req.query

    // 2. Get all videos based on query, sort, pagination)
    let pipeline = [
        {
            $match: {
                $and: [
                    {
                        // 2.1 match the videos based on title and description
                        $or: [
                            { title: { $regex: query, $options: "i" } },   // $regex: is used to search the string in the title "this is first video" => "first"  // i is for case-insensitive
                            { description: { $regex: query, $options: "i" } }
                        ]
                    },
                    // 2.2 match the videos based on userId=Owner
                    ...( userId ? [ { Owner: new mongoose.Types.ObjectId( userId ) } ] : "" )  // if userId is present then match the Owner field of video 
                    // new mongoose.Types.ObjectId( userId ) => convert userId to ObjectId
                ]
            }
        },
        // 3. lookup the Owner field of video and get the user details
        {   // from user it match the _id of user with Owner field of video and saved as Owner
            $lookup: {
                from: "users",
                localField: "Owner",
                foreignField: "_id",
                as: "Owner",
                pipeline: [  // project the fields of user in Owner 
                    {
                        $project: {
                            _id: 1,
                            fullName: 1,
                            avatar: "$avatar.url",
                            username: 1,
                        }
                    }
                ]
            }
        },
        {
            // 4. addFields just add the Owner field to the video document 
            $addFields: {
                Owner: {
                    $first: "$Owner",  // $first: is used to get the first element of Owner array
                },
            },
        },
        {
            $sort: { [ sortBy ]: sortType }  // sort the videos based on sortBy and sortType
        }
    ];

    try
    {
        // 5. set options for pagination
        const options = {  // options for pagination
            page: parseInt( page ),
            limit: parseInt( limit ),
            customLabels: {   // custom labels for pagination
                totalDocs: "totalVideos",
                docs: "videos",
            },
        };

        // 6. get the videos based on pipeline and options
        const result = await Video.aggregatePaginate( Video.aggregate( pipeline ), options );  // Video.aggregate( pipeline ) find the videos based on pipeline(query, sortBy, sortType, userId). // aggregatePaginate is used for pagination (page, limit)

        if ( result?.videos?.length === 0 ) { return res.status( 404 ).json( new ApiResponse( 404, {}, "No Videos Found" ) ); }

        // result contain all pipeline videos and pagination details
        return res.status( 200 ).json( new ApiResponse( 200, result, "Videos fetched successfully" ) );

    } catch ( error )
    {
        console.error( error.message );
        return res.status( 500 ).json( new Apierror( 500, {}, "Internal server error in video aggregation" ) );
    }
});

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description} = req.body
    // TODO: get video, upload to cloudinary, create video

    if(!title || !description){
        throw new ApiError(400, "title and description is required")
    }
    const videoFileLocalPath = req.files?.videoFile[0]?.path
    const thumbnailLocalPath=req.files?.thumbnail[0].path;

    if(!videoFileLocalPath){
        throw new ApiError(400,"video file is not provided")
    }
    if(!thumbnailLocalPath){
        throw new ApiError(400,"thumnail is not provided")
    }
    const videoFile= await uploadOnCloud(videoFileLocalPath)
    if(!videoFile.url){
        throw new ApiError(400,"error while uplaoding video on cloudnary")
    }
    
    const thumbnail= await uploadOnCloud(thumbnailLocalPath)
    if(!thumbnail.url){
        throw new ApiError(400,"error while uplaoding thumbanail on cloudnary")
    }

    const PublishedVideo= await Video.create({
        videoFile:videoFile?.url,
        thumbnail: thumbnail?.url,
        title,
        description,
        duration: videoFile?.duration,
        isPublished: true,
        owner: req.user?._id
    })
    
    if(!PublishedVideo) throw new ApiError("something went wrong while uplaoding video in database")

    return res.status(200).json(new ApiResponse(200,PublishedVideo,"video uplaoded successfully"))
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: get video by id
    if ( !isValidObjectId( videoId ) ) { throw new ApiError( 400, "Invalid VideoID" ) }
    const video= await Video.findById(videoId)
    if ( !video ) { throw new ApiError( 400, "Failed to get Video details or video does not exist." ) }
    return res.status(200).json(new ApiResponse(200,video,"video fetched successfully"))
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: update video details like title, description, thumbnail
    if(!isValidObjectId(videoId)) {throw new ApiError(400,"invalid video id")}

    const {title,description}=req.body
    if ( [ title, description ].some( ( feild ) => feild.trim() === "" ) ) { throw new ApiError( 400, "Please provide title, description")}

    const thumbnailLocalPath = req.file?.path
    if ( !thumbnailLocalPath ) { throw new ApiError( 400, "thumbnail not found" ) }

    const video=await Video.findById(videoId)

    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You don't have permission to update this video");
    }

    const thumbnailOnCloudnary = await uploadOnCloud( thumbnailLocalPath, "img" )
    if ( !thumbnailOnCloudnary ) { throw new ApiError( 400, "thumbnail not uploaded on cloudinary" ) }

    video.title = title
    video.description = description
    video.thumbnail = thumbnailOnCloudnary.url
    await video.save()

    return res.status( 200 ).json( new ApiResponse( 200, video, "Video details updated successfully" ) )
})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: delete video
    if(!isValidObjectId(videoId)) {throw new ApiError(400,"video id not valid")}

    const video = await Video.findById( videoId )
    if ( !video ) { throw new ApiError( 400, "Invalid Video" ) }

    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You don't have permission to update this video");
    }

    await video.deleteOne(); 
    return res.status( 200 )
        .json( new ApiResponse( 200, {}, "Video Deleted successfully" ) )
    
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if ( !isValidObjectId( videoId ) ) { throw new ApiError( 400, "Invalid VideoID" ) }

    const toggleisPUblished = await Video.findOne(    // findOne will check _id AND Owner both should match  // dont use findById it only check _id 
        {
            _id: videoId,     // The document must have this _id (videoId)
            Owner: req.user._id, // The Owner field must match req.user._id
        },
    );

    if ( !toggleisPUblished ) { throw new ApiError( 400, "Invalid Video or Owner" ) }

    toggleisPUblished.isPUblished = !toggleisPUblished.isPUblished

    await toggleisPUblished.save({ validateBeforeSave: false })

    return res.status( 200 )
        .json( new ApiResponse( 200, toggleisPUblished.isPUblished, "isPUblished toggled successfully" ) )
})


export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}