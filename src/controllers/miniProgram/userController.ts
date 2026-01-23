import type { Request, Response } from "express";
// @ts-ignore
<<<<<<< HEAD
import {userInfoService} from "../../services/miniProgram/userService.ts"
=======
import {userInfoService} from "../../services/miniProgram/userService"
>>>>>>> 4d9c73e (🐛 修复打包)
export  const  info = async (req:Request,res:Response) => {
    try{
        // @ts-ignore
        let result =   await userInfoService(req,res);
        res.status(200).json({
            code: 200,
            message:"ok",
            data: result
        });
    }catch (error){
        res.status(403).json({code:403,message:""})
    }
}