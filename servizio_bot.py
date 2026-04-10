import win32serviceutil
import win32service
import win32event
import subprocess
import os

class MarcheseBotService(win32serviceutil.ServiceFramework):
    _svc_name_ = "MarcheseBotService"
    _svc_display_name_ = "Il Marchese Bot"
    _svc_description_ = "Bot Telegram Marketing Manager"

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        self.process = None

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        if self.process:
            self.process.terminate()
        win32event.SetEvent(self.hWaitStop)

    def SvcDoRun(self):
        self.process = subprocess.Popen(
            ["python", "bot_telegram.py"],
            cwd=r"C:\Users\super\Desktop\MARKETING MANAGER"
        )
        self.process.wait()

if __name__ == "__main__":
    win32serviceutil.HandleCommandLine(MarcheseBotService)