import { SageLoadingFrame } from "@/components/sage/loading-frame";

export default function Loading() {
  return <SageLoadingFrame frameClassName="-mx-4 -mb-24 -mt-5 h-[calc(100dvh-62px-56px-env(safe-area-inset-bottom))] sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mb-10 lg:h-[calc(100dvh-62px)]" />;
}
