import { AlertCircle } from "lucide-react";

type RegisterErrorAlertProps = {
  details?: string[];
  message: string;
  title?: string;
};

export function RegisterErrorAlert({
  details = [],
  message,
  title,
}: RegisterErrorAlertProps) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          {title ? <p className="font-semibold">{title}</p> : null}
          <p className={title ? "mt-1" : ""}>{message}</p>
          {details.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 ps-5 text-red-800">
              {details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
