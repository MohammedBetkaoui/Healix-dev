import styles from "./RegisterPage.module.css";

type FormErrorMessageProps = {
  id: string;
  message?: string;
};

export function FormErrorMessage({ id, message }: FormErrorMessageProps) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} className={styles.fieldError}>
      {message}
    </p>
  );
}
