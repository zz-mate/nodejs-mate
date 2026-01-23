import type { Request, Response } from "express";
// @ts-ignore
<<<<<<< HEAD
import {demoList} from "../../services/miniProgram/demoService.ts"
=======
import {demoList} from "../../services/miniProgram/demoService"
>>>>>>> 4d9c73e (🐛 修复打包)
export  const  list = async (req:Request,res:Response) => {
    try{
         // @ts-ignore
      let result =   await demoList();
      res.status(200).json({
          code: 200,
          message:"ok",
          data: result
      });
    }catch (error){
        res.status(403).json({code:403,message:""})
    }
}