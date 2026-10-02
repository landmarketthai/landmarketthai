"use client";

export default function BuyerDemandError({ reset }: { reset: () => void }) {
  return <div className="container-xl section text-center" role="alert">
    <h1 className="text-xl font-bold">โหลดความต้องการซื้อไม่ได้ในขณะนี้</h1>
    <p className="my-4">กรุณาลองใหม่อีกครั้ง</p>
    <button onClick={reset} className="btn-outline">ลองใหม่</button>
  </div>;
}
