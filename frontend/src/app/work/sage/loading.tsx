import { SageLoadingFrame } from "@/components/sage/loading-frame";

export default function Loading() {
  return <SageLoadingFrame frameClassName="-mx-4 -mb-28 -mt-6 h-[calc(100dvh-64px-64px-env(safe-area-inset-bottom))] sm:-mx-6 lg:-mx-8 lg:-mb-12 lg:h-[calc(100dvh-64px)]" />;
}
