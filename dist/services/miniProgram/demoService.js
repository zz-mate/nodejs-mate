// @ts-ignore
import DemoModel from "../../modules/miniProgram/DemoModule.ts";
export const demoList = () => {
    return DemoModel.findAll();
};
