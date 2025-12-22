import type { Request, Response } from "express";
// @ts-ignore
import {userInfoService,userQrcodeService} from "../../services/miniProgram/userService"
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

export  const  qrcode = async (req:Request,res:Response) => {
    try{
        // @ts-ignore
        let result =   await userQrcodeService(req,res);
        res.status(200).json({
            code: 200,
            message:"ok",
            data: result
        });
    }catch (error){
        res.status(403).json({code:403,message:""})
    }
}
