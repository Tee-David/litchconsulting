import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  SiAsana,
  SiWhatsapp,
  SiQuickbooks,
  SiIntuit,
  SiNotion,
  SiGoogledrive,
  SiGooglesheets,
  SiGooglemeet,
  SiGmail,
  SiDropbox,
  SiTrello,
  SiZoom,
  SiXero,
  SiSage,
  SiFigma,
  SiZapier,
  SiHubspot,
  SiMailchimp,
  SiStripe,
  SiClickup,
  SiAirtable,
} from "react-icons/si";

/** White chip that houses a work-tool logo, tinted with the brand's colour. */
function Chip({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div
      className="flex size-full items-center justify-center rounded-full bg-white shadow-lg shadow-black/25 ring-1 ring-black/5 [&_svg]:size-[56%]"
      style={{ color }}
    >
      {children}
    </div>
  );
}

const Si = (Icon: IconType, color: string) => (
  <Chip color={color}>
    <Icon />
  </Chip>
);

/* Slack & Excel were removed from Simple Icons (trademark), so we ship them
   as full-colour inline marks. */
const SlackMark = () => (
  <Chip>
    <svg viewBox="0 0 122.8 122.8" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z"
        fill="#e01e5a"
      />
      <path
        d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z"
        fill="#36c5f0"
      />
      <path
        d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z"
        fill="#2eb67d"
      />
      <path
        d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z"
        fill="#ecb22e"
      />
    </svg>
  </Chip>
);

const ExcelMark = () => (
  <Chip>
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M28 6h14a2 2 0 0 1 2 2v32a2 2 0 0 1-2 2H28V6z"
        fill="#1d6f42"
      />
      <path d="M28 12h16v6H28zm0 9h16v6H28zm0 9h16v6H28z" fill="#fff" opacity="0.85" />
      <path d="M4 10l24-4v36l-24-4V10z" fill="#185c37" />
      <path
        d="M12.5 18l3.4 6 3.6-6h3.9l-5.4 8 5.5 8h-4l-3.6-6.2L11.9 34H8l5.6-8L8.2 18h4.3z"
        fill="#fff"
      />
    </svg>
  </Chip>
);

/** Work-tool logos that orbit the hero. Order defines the ring layout. */
export const orbitOuter: ReactNode[] = [
  SlackMark(),
  Si(SiAsana, "#f06a6a"),
  ExcelMark(),
  Si(SiQuickbooks, "#2ca01c"),
  Si(SiNotion, "#000000"),
  Si(SiGoogledrive, "#1fa463"),
  Si(SiZoom, "#0b5cff"),
  Si(SiTrello, "#0052cc"),
  Si(SiDropbox, "#0061ff"),
  Si(SiWhatsapp, "#25d366"),
  Si(SiFigma, "#f24e1e"),
  Si(SiStripe, "#635bff"),
];

export const orbitInner: ReactNode[] = [
  Si(SiGooglesheets, "#0f9d58"),
  Si(SiXero, "#13b5ea"),
  Si(SiHubspot, "#ff7a59"),
  Si(SiMailchimp, "#ffe01b"),
  Si(SiSage, "#00d639"),
  Si(SiZapier, "#ff4a00"),
  Si(SiClickup, "#7b68ee"),
  Si(SiAirtable, "#18bfff"),
  Si(SiIntuit, "#236cff"),
  Si(SiGmail, "#ea4335"),
  Si(SiGooglemeet, "#00897b"),
];
