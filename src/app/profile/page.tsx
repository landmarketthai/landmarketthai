import type { Metadata } from "next";
import ProfileClient from "./ProfileClient";

export const metadata: Metadata = {
  title: "โปรไฟล์ของฉัน",
};

export default function ProfilePage() {
  return <ProfileClient />;
}
