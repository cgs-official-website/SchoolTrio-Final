import React from 'react';
import PaymentReport, { COLLECTION_COLUMNS } from './PaymentReport';

export default function BusFeeCollection() {
    return <PaymentReport title="Bus Fee Collections" columns={COLLECTION_COLUMNS} fileBase="Bus_Fee_Collection" excelTitle="BUS FEE COLLECTION" />;
}
