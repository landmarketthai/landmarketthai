import { permanentRedirect } from "next/navigation";

export default function LegacySubmitLandPage() {
  permanentRedirect("/sell");
}
