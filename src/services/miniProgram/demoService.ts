// @ts-ignore
import  DemoModel from "../../modules/miniProgram/DemoModule"

export const demoList = () => {
    return DemoModel.findAll()
}