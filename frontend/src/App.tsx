import { FormEvent, useEffect, useState } from 'react';
import LoginModal, {
  AuthMode,
  LoginFormState,
  RegisterFormState,
  SchoolOption,
} from './components/LoginModal';
import ShopeePage from './modules/shopee/ShopeePage';
import homeLogo from './assets/home/logo.png';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [schoolKeyword, setSchoolKeyword] = useState('');
  const [schoolOptions, setSchoolOptions] = useState<SchoolOption[]>([]);
  const [isSchoolLoading, setIsSchoolLoading] = useState(false);
  const [loginForm, setLoginForm] = useState<LoginFormState>({
    username: '',
    password: '',
  });
  const [registerForm, setRegisterForm] = useState<RegisterFormState>({
    school_id: null,
    school_name: '',
    major: '',
    class_name: '',
    full_name: '',
    username: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    const verifyExistingToken = async () => {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) {
        setIsAuthChecking(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem(ACCESS_TOKEN_KEY);
        }
      } catch {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
      } finally {
        setIsAuthChecking(false);
      }
    };

    void verifyExistingToken();
  }, []);

  useEffect(() => {
    if (authMode !== 'register') return;

    const query = schoolKeyword.trim();
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSchoolLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.length > 0) params.set('q', query);
        const response = await fetch(`${API_BASE_URL}/auth/schools?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setSchoolOptions([]);
          return;
        }
        const data = (await response.json()) as SchoolOption[];
        setSchoolOptions(data);
      } catch {
        setSchoolOptions([]);
      } finally {
        setIsSchoolLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [authMode, schoolKeyword]);

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginForm.username.trim(),
          password: loginForm.password,
        }),
      });

      if (!response.ok) {
        setAuthError('账号或密码错误，请重试。');
        return;
      }

      const result = await response.json();
      localStorage.setItem(ACCESS_TOKEN_KEY, result.access_token);
      setIsAuthenticated(true);
      setLoginForm({ username: '', password: '' });
    } catch {
      setAuthError('登录服务暂不可用，请稍后再试。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');

    if (!registerForm.school_id) {
      setAuthError('请选择学校。');
      return;
    }
    if (!registerForm.major.trim()) {
      setAuthError('请输入专业。');
      return;
    }
    if (!registerForm.class_name.trim()) {
      setAuthError('请输入班级。');
      return;
    }
    if (!registerForm.full_name.trim()) {
      setAuthError('请输入姓名。');
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      setAuthError('两次输入的密码不一致。');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: registerForm.school_id,
          major: registerForm.major.trim(),
          class_name: registerForm.class_name.trim(),
          full_name: registerForm.full_name.trim(),
          username: registerForm.username.trim(),
          password: registerForm.password,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setAuthError(payload.detail || '注册失败，请检查手机号格式或稍后重试。');
        return;
      }

      setRegisterForm({
        school_id: null,
        school_name: '',
        major: '',
        class_name: '',
        full_name: '',
        username: '',
        password: '',
        confirmPassword: '',
      });
      setSchoolKeyword('');
      setSchoolOptions([]);
      setLoginForm({ username: registerForm.username.trim(), password: '' });
      setAuthMode('login');
      setAuthError('注册成功，请使用账号密码登录。');
    } catch {
      setAuthError('注册服务暂不可用，请稍后再试。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {isAuthenticated ? <ShopeePage /> : <div className="w-screen h-screen bg-[#f5f5f5]" />}
      {!isAuthChecking && (
        <LoginModal
          open={!isAuthenticated}
          authMode={authMode}
          loginForm={loginForm}
          registerForm={registerForm}
          schoolKeyword={schoolKeyword}
          schoolOptions={schoolOptions}
          isSchoolLoading={isSchoolLoading}
          authError={authError}
          isSubmitting={isSubmitting}
          showPassword={showPassword}
          logoSrc={homeLogo}
          onClose={() => {}}
          onSetAuthMode={setAuthMode}
          onSetLoginForm={setLoginForm}
          onSetRegisterForm={setRegisterForm}
          onSetSchoolKeyword={setSchoolKeyword}
          onSetShowPassword={setShowPassword}
          onClearError={() => setAuthError('')}
          onLoginSubmit={handleLoginSubmit}
          onRegisterSubmit={handleRegisterSubmit}
        />
      )}
    </>
  );
}
