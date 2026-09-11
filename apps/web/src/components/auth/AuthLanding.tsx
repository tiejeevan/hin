import { AuthForm } from './AuthForm';
import { AuthTagline } from './AuthTagline';

interface AuthLandingProps {
  isRegisterMode: boolean;
  usernameInput: string;
  emailInput: string;
  passwordInput: string;
  authError: string | null;
  isAuthLoading: boolean;
  onSubmit: (e: React.FormEvent, turnstileToken?: string) => void;
  onUsernameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onToggleMode: () => void;
  onGoogleCredential?: (credential: string) => void;
}

export function AuthLanding(props: AuthLandingProps) {
  return (
    <div className="flex-grow flex flex-col items-center justify-center p-4 bg-radial from-indigo-900/10 via-transparent to-transparent">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <AuthTagline />
        </div>

        <AuthForm embedded {...props} />
      </div>
    </div>
  );
}
