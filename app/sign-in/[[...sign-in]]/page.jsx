import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex justify-center items-center min-h-screen bg-black">
      <SignIn
        appearance={{
          baseTheme: "dark", 
          elements: {
            rootBox:
              "flex justify-center items-center w-full max-w-md mx-auto",
            card: "mx-auto",
          },
        }}
      />
    </div>
  );
}
