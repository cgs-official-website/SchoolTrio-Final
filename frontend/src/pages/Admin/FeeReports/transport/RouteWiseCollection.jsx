import React from 'react';
import PaymentReport, { ROUTE_WISE_COLUMNS } from './PaymentReport';

export default function RouteWiseCollection() {
    return <PaymentReport title="Route Wise Collections" columns={ROUTE_WISE_COLUMNS} fileBase="Route_Wise_Collection" excelTitle="ROUTE WISE COLLECTION REPORT" showCategory />;
}
