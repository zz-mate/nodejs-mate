// @ts-ignore
<<<<<<< HEAD
import  DemoModel from "../../modules/miniProgram/DemoModule.ts"
=======
import  DemoModel from "../../modules/miniProgram/DemoModule"
>>>>>>> 4d9c73e (🐛 修复打包)

export const demoList = () => {
    return DemoModel.findAll()
}