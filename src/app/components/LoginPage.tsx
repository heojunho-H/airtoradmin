import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, Wind, Lock, User } from 'lucide-react';

export function LoginPage() {
  const [id, setId] = useState('');
  const [pass, setPass] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!id || !pass) {
      setErrorMessage('아이디와 비밀번호를 입력해주세요.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('https://airtor.co.kr/api/login_api.php', {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, pass }),
      });

      const data = await response.json();

      if (data.status === 'success') {
        // 로그인 성공 시 user_name을 localStorage에 저장
        localStorage.setItem('user_name', data.user_name);
        localStorage.setItem('user_id', id);
        // 대시보드로 리다이렉트
        navigate('/dashboard');
      } else {
        // 실패 또는 에러 시 메시지 표시
        setErrorMessage(data.message || '로그인에 실패했습니다.');
      }
    } catch (error) {
      setErrorMessage('서버와의 연결에 문제가 발생했습니다. 다시 시도해주세요.');
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-sky-50 px-4 py-8">
      {/* 배경 장식 요소 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-sky-200/30 rounded-full blur-3xl"></div>
      </div>

      {/* 로그인 카드 */}
      <div className="w-full max-w-md relative z-10">
        {/* 로고 및 타이틀 섹션 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-sky-600 rounded-2xl shadow-lg shadow-blue-500/25 mb-4">
            <Wind className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">AIRTOR System</h1>
          <p className="text-sm md:text-base text-slate-600">에어컨 청소 서비스 관리자 로그인</p>
        </div>

        {/* 로그인 폼 카드 */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/50 p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 아이디 입력 필드 */}
            <div className="space-y-2">
              <label htmlFor="id" className="text-sm font-medium text-slate-700 block">
                아이디
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="id"
                  type="text"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  disabled={isLoading}
                  placeholder="아이디를 입력하세요"
                  className="w-full pl-11 pr-4 py-3 text-[15px] bg-slate-50 border border-slate-200 rounded-xl
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white
                           disabled:bg-slate-100 disabled:cursor-not-allowed
                           transition-all duration-200 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* 비밀번호 입력 필드 */}
            <div className="space-y-2">
              <label htmlFor="pass" className="text-sm font-medium text-slate-700 block">
                비밀번호
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="pass"
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  disabled={isLoading}
                  placeholder="비밀번호를 입력하세요"
                  className="w-full pl-11 pr-4 py-3 text-[15px] bg-slate-50 border border-slate-200 rounded-xl
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white
                           disabled:bg-slate-100 disabled:cursor-not-allowed
                           transition-all duration-200 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* 에러 메시지 */}
            {errorMessage && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-700 text-center">{errorMessage}</p>
              </div>
            )}

            {/* 로그인 버튼 */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-sky-600 text-white text-[15px] font-medium
                       rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30
                       disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none
                       transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                       flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>로그인 중...</span>
                </>
              ) : (
                <span>로그인</span>
              )}
            </button>
          </form>

          {/* 추가 정보 */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-xs text-center text-slate-500">
              관리자 계정이 필요하신가요?{' '}
              <button className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
                문의하기
              </button>
            </p>
          </div>
        </div>

        {/* 푸터 */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-500">
            © 2026 AIRTOR System. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
