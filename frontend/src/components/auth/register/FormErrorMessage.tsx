type FormErrorMessageProps = {
  id: string;
  message?: string;
};

export function FormErrorMessage({ id, message }: FormErrorMessageProps) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} className="mt-2 text-sm font-medium text-red-600">
      {message}
    </p>
  );
}
