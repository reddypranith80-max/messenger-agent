import type { Metadata } from "next";
import MeetingsIndex from "../page";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

/** The same calendar as the index; this route exists so phones, which show the list at the index, can reach it. */
export default MeetingsIndex;
