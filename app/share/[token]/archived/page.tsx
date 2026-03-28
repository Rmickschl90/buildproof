import SharePage from "../page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ArchivedSharePage(props: {
  params: any;
}) {
  const resolvedParams =
    props?.params && typeof (props.params as any)?.then === "function"
      ? await props.params
      : props?.params;

  return SharePage({
    params: resolvedParams,
    searchParams: { archived: "1" },
  } as any);
}