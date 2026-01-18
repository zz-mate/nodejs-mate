import type { Request, Response } from "express";
// @ts-ignore
import subscribeModule from "../../modules/miniProgram/SubscribeModule";

export const subscribeList = () => {
    return subscribeModule.findAll();
};
export const isSubscribeService = (req:Request,res:Response) => {
    let {openid,template_id} = req.body;
    return subscribeModule.isSubscribe(openid,template_id)
};