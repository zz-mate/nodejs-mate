import type { Request, Response } from "express";
// @ts-ignore
import WxModules from "../../modules/miniProgram/WxModules";
export  const  getCode2Session = async (req:Request,res:Response) => {
    try{
        // @ts-ignore
        const {code} = req.body;
        let result =   await WxModules.jscode2session(code);
        res.status(200).json({
            code: 200,
            message:"ok",
            data: result
        });
    }catch (error){
        res.status(403).json({code:403,message:""})
    }
}
export  const  saveUser = async (req:Request,res:Response) => {
    try{
        // @ts-ignore
        const {openid} = req.body;
        let result =   await WxModules.saveUser(openid);
        res.status(200).json({
            code: 200,
            message:"ok",
            data: result
        });
    }catch (error){
        res.status(403).json({code:403,message:""})
    }
}