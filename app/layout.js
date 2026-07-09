export const metadata = {
  title: "MyTime",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        {children}
        <script src="/device-confidence-learn.js" defer />
      </body>
    </html>
  );
}
