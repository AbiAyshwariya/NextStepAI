import React from "react";

export default function AuthLayout({ children }) {
  return (
    <div className="flex justify-center items-center min-h-screen bg-black">
      <div className="w-full max-w-md flex justify-center">
        {children}
      </div>
    </div>
  );
}