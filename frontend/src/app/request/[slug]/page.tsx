import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { getCatalogService } from "@/lib/services/catalog";
import { RequestStepper } from "@/components/requests/request-stepper";
import { toStepperService } from "@/components/requests/stepper-utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = await getCatalogService(slug).catch(() => null);
  if (!service) return { title: "Request a service" };
  return {
    title: `Request ${service.name}`,
    description: `Start your ${service.name} engagement with Litch Consulting in a few guided steps.`,
  };
}

/**
 * Public entry to the request funnel: the visitor confirms the service and
 * writes their brief BEFORE the account wall (the draft carries across it).
 */
export default async function PublicRequestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = await getCatalogService(slug);
  if (!service || !service.active) notFound();

  return (
    <>
      <Header />
      <main className="flex-1 bg-cloud">
        <div className="mx-auto max-w-5xl px-4 pb-20 pt-28 sm:px-6">
          <Link
            href="/get-started"
            className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" /> All services
          </Link>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Request a service
          </h1>
          <p className="mt-2 max-w-xl text-sm text-body">
            Three quick steps — tell us what you need, and we take it from there. You can track
            everything from your dashboard afterwards.
          </p>
          <div className="mt-10">
            <RequestStepper service={toStepperService(service)} mode="public" />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
