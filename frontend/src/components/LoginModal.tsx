import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, User, X } from 'lucide-react';

export type AuthMode = 'login' | 'register';

export interface LoginFormState {
  username: string;
  password: string;
}

export interface RegisterFormState {
  school_id: number | null;
  school_name: string;
  major: string;
  class_name: string;
  full_name: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export interface SchoolOption {
  id: number;
  name: string;
}

interface LoginModalProps {
  open: boolean;
  authMode: AuthMode;
  loginForm: LoginFormState;
  registerForm: RegisterFormState;
  schoolKeyword: string;
  schoolOptions: SchoolOption[];
  isSchoolLoading: boolean;
  authError: string;
  isSubmitting: boolean;
  showPassword: boolean;
  logoSrc: string;
  onClose: () => void;
  onSetAuthMode: (mode: AuthMode) => void;
  onSetLoginForm: (updater: (prev: LoginFormState) => LoginFormState) => void;
  onSetRegisterForm: (updater: (prev: RegisterFormState) => RegisterFormState) => void;
  onSetSchoolKeyword: (value: string) => void;
  onSetShowPassword: (updater: (prev: boolean) => boolean) => void;
  onClearError: () => void;
  onLoginSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRegisterSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function LoginModal({
  open,
  authMode,
  loginForm,
  registerForm,
  schoolKeyword,
  schoolOptions,
  isSchoolLoading,
  authError,
  isSubmitting,
  showPassword,
  logoSrc,
  onClose,
  onSetAuthMode,
  onSetLoginForm,
  onSetRegisterForm,
  onSetSchoolKeyword,
  onSetShowPassword,
  onClearError,
  onLoginSubmit,
  onRegisterSubmit,
}: LoginModalProps) {
  const [modalScale, setModalScale] = useState(1);
  const [schoolDropdownOpen, setSchoolDropdownOpen] = useState(false);
  const schoolFieldRef = useRef<HTMLLabelElement>(null);
  const schoolSelected = registerForm.school_id !== null && schoolKeyword.trim() === registerForm.school_name.trim();

  useEffect(() => {
    const baseWidth = authMode === 'register' ? 760 : 460;
    const baseHeight = authMode === 'register' ? 860 : 640;

    const handleResize = () => {
      const widthScale = (window.innerWidth - 32) / baseWidth;
      const heightScale = (window.innerHeight - 32) / baseHeight;
      setModalScale(Math.min(widthScale, heightScale, 1));
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [authMode]);

  useEffect(() => {
    if (!schoolDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!schoolFieldRef.current) return;
      if (!schoolFieldRef.current.contains(event.target as Node)) {
        setSchoolDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [schoolDropdownOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="relative rounded-[28px] border border-white/60 bg-[#f8fbff]/95 backdrop-blur-xl shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
        style={{
          width: authMode === 'register' ? '760px' : '460px',
          transform: `scale(${modalScale})`,
          transformOrigin: 'center center',
          transition: 'width 0.22s ease, transform 0.22s ease',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          aria-label="关闭登录弹窗"
        >
          <X size={16} />
        </button>

        <div className="px-8 pt-10 pb-8">
          <div className="relative mx-auto mb-5 h-20 w-20">
            <span className="logo-breathe absolute inset-[-10px] rounded-full bg-blue-400/35 blur-xl" />
            <span className="logo-breathe logo-breathe-delay absolute inset-[-16px] rounded-full bg-blue-300/25 blur-2xl" />
            <div className="relative h-20 w-20 rounded-full border-4 border-blue-100 bg-white shadow-[0_10px_25px_rgba(37,99,235,0.2)] p-1">
              <img src={logoSrc} alt="平台 Logo" className="h-full w-full rounded-full object-cover" />
            </div>
          </div>

          <div className="text-center mb-7">
            <h3 className="text-[32px] leading-none font-black text-slate-800 tracking-tight">
              {authMode === 'login' ? '欢迎登录 CBEC SIM' : '注册玩家账号'}
            </h3>
            <p className="text-sm text-slate-500 mt-3">
              {authMode === 'login' ? '跨境电商全链路经营模拟平台' : '请使用手机号注册，默认角色为 Player'}
            </p>
          </div>

          {authMode === 'login' ? (
            <form onSubmit={onLoginSubmit} className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">账号</span>
                <div className="relative mt-2">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={loginForm.username}
                    onChange={(event) => onSetLoginForm((prev) => ({ ...prev, username: event.target.value }))}
                    placeholder="请输入账号（手机号）"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-12 py-3 text-[15px] text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/70"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">密码</span>
                <div className="relative mt-2">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginForm.password}
                    onChange={(event) => onSetLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="请输入登录密码"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-12 py-3 pr-12 text-[15px] text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/70"
                  />
                  <button
                    type="button"
                    onClick={() => onSetShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              {authError && (
                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 px-3 py-2 rounded-lg">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 h-12 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 text-white text-base font-bold shadow-[0_10px_20px_rgba(37,99,235,0.35)] hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {isSubmitting ? '登录中...' : '登录进入系统'}
              </button>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    onClearError();
                    onSetAuthMode('register');
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
                >
                  还没有账号？立即注册
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={onRegisterSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
              <label ref={schoolFieldRef} className="relative block col-span-2">
                <span className="text-sm font-semibold text-slate-700">学校</span>
                <div className="relative mt-2">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={schoolKeyword}
                    onFocus={() => {
                      if (!schoolSelected) setSchoolDropdownOpen(true);
                    }}
                    onChange={(event) => {
                      setSchoolDropdownOpen(true);
                      onSetSchoolKeyword(event.target.value);
                      onSetRegisterForm((prev) => ({
                        ...prev,
                        school_id: null,
                        school_name: event.target.value,
                      }));
                    }}
                    placeholder="请输入学校名称搜索"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-12 py-3 text-[15px] text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/70"
                  />
                </div>
                {schoolDropdownOpen &&
                  !schoolSelected &&
                  schoolOptions.length > 0 &&
                  schoolKeyword.trim().length > 0 && (
                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40">
                    <div className="relative overflow-hidden rounded-xl border border-white/60 bg-white/20 p-1 shadow-[0_18px_40px_rgba(15,23,42,0.22)] backdrop-blur-xl">
                      <div className="max-h-36 overflow-y-auto">
                        {schoolOptions.map((school) => (
                          <button
                            key={school.id}
                            type="button"
                            onClick={() => {
                              setSchoolDropdownOpen(false);
                              onSetSchoolKeyword(school.name);
                              onSetRegisterForm((prev) => ({
                                ...prev,
                                school_id: school.id,
                                school_name: school.name,
                              }));
                            }}
                            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-white/70"
                          >
                            {school.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">专业</span>
                <div className="relative mt-2">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={registerForm.major}
                    onChange={(event) => onSetRegisterForm((prev) => ({ ...prev, major: event.target.value }))}
                    placeholder="请输入专业"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-12 py-3 text-[15px] text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/70"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">班级</span>
                <div className="relative mt-2">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={registerForm.class_name}
                    onChange={(event) => onSetRegisterForm((prev) => ({ ...prev, class_name: event.target.value }))}
                    placeholder="请输入班级（如 电商2301）"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-12 py-3 text-[15px] text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/70"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">姓名</span>
                <div className="relative mt-2">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={registerForm.full_name}
                    onChange={(event) => onSetRegisterForm((prev) => ({ ...prev, full_name: event.target.value }))}
                    placeholder="请输入真实姓名"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-12 py-3 text-[15px] text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/70"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">手机号</span>
                <div className="relative mt-2">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={registerForm.username}
                    onChange={(event) => onSetRegisterForm((prev) => ({ ...prev, username: event.target.value }))}
                    placeholder="请输入 11 位手机号"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-12 py-3 text-[15px] text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/70"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">密码</span>
                <div className="relative mt-2">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={registerForm.password}
                    onChange={(event) => onSetRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="请设置密码"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-12 py-3 pr-12 text-[15px] text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/70"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">确认密码</span>
                <div className="relative mt-2">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={registerForm.confirmPassword}
                    onChange={(event) =>
                      onSetRegisterForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                    }
                    placeholder="请再次输入密码"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-12 py-3 pr-12 text-[15px] text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/70"
                  />
                </div>
              </label>
              </div>

              {authError && (
                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 px-3 py-2 rounded-lg">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 h-12 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 text-white text-base font-bold shadow-[0_10px_20px_rgba(37,99,235,0.35)] hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {isSubmitting ? '注册中...' : '完成注册'}
              </button>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    onClearError();
                    onSetAuthMode('login');
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
                >
                  已有账号？返回登录
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 flex items-center justify-center gap-5 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck size={13} />
              连接安全加密
            </span>
            <span className="flex items-center gap-1">
              <Lock size={13} />
              账户隐私保护
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
