import { Link } from "react-router-dom";
import { NiyamstackLogo } from "../brand/NiyamstackLogo";

export function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const title = kind === "terms" ? "Terms and conditions" : "Privacy policy";
  return (
    <div className="min-h-svh bg-white px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <NiyamstackLogo />
        <h1 className="mt-8 text-2xl font-bold text-navy">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          {kind === "terms"
            ? "Niyamstack Propel is an institute operating system. Institute owners are responsible for student data, fees, and the content they publish on their own website. Do not share login OTPs. Refunds follow the institute’s fee policy."
            : "We store the account details you enter (name, mobile, email) to run classes, fees, and login. Institute owners control student records on their tenant. Contact support@niyamstack.com for access or deletion requests."}
        </p>
        <Link className="mt-8 inline-block text-sm font-medium text-brand" to="/login">
          Back to login
        </Link>
      </div>
    </div>
  );
}
