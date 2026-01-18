// @ts-ignore
import analyticsModule from "../../modules/admin/analyticsModule";

export const analyticsService = () => {
    return analyticsModule.getAnalyticsCards();
};
