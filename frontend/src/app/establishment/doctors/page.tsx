import { permanentRedirect } from "next/navigation";

// The team module: the doctors page of the establishment, replaced by the
// team management itself. Bookmarks in the older address still work.
export default function Page() {
  permanentRedirect("/establishment/team");
}
