import styles from "./RegisterPage.module.css";

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
      className={styles.alert}
    >
      <span className={styles.alertIcon} aria-hidden="true">!</span>
      <div>
        {title ? <p className={styles.alertTitle}>{title}</p> : null}
        <p className={title ? styles.alertMessageWithTitle : undefined}>{message}</p>
        {details.length > 0 ? (
          <ul className={styles.alertDetails}>
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
