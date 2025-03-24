import flet as ft
import socket
import threading
import select
import logging
import time
import multiprocessing
from plyer import notification

# إعدادات التسجيل
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

# قائمة البروكسيات
proxies = [
    {'host': '157.240.195.32', 'port': 8080},
    {'host': '157.240.253.39', 'port': 8080},
    {'host': '157.240.196.32', 'port': 8080},
    {'host': '157.240.9.39', 'port': 8080},
    {'host': '31.13.83.39', 'port': 8080},
    {'host': '102.132.97.39', 'port': 8080},
    {'host': '31.13.84.39', 'port': 8080},
    {'host': '185.60.218.39', 'port': 8080}
]

class ProxyServer:
    def __init__(self):
        self.current_proxy_index = 0
        self.is_running = False
        self.proxy_socket = None

    def show_notification(self, title, message):
        """إظهار إشعار في شريط الإشعارات"""
        notification.notify(
            title=title,
            message=message,
            timeout=10
        )
    
    def get_current_proxy(self):
        return proxies[self.current_proxy_index]
    
    def switch_proxy(self):
        if not self.is_running:
            return
            
        self.current_proxy_index = (self.current_proxy_index + 1) % len(proxies)
        logging.info(f"Switched to proxy: {self.get_current_proxy()}")
        threading.Timer(20, self.switch_proxy).start()
    
    def handle_client(self, client_socket, client_address):
        target_socket = None
        try:
            logging.info(f"Connection from {client_address}")
            
            proxy = self.get_current_proxy()
            target_host = proxy['host']
            target_port = proxy['port']
            
            target_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            target_socket.connect((target_host, target_port))
            
            while self.is_running:
                ready = select.select([client_socket, target_socket], [], [], 1.0)
                
                for sock in ready[0]:
                    if sock == client_socket:
                        client_data = client_socket.recv(4096)
                        if not client_data:
                            return
                        target_socket.send(client_data)
                    else:
                        target_data = target_socket.recv(4096)
                        if not target_data:
                            return
                        client_socket.send(target_data)
                        
        except Exception as e:
            logging.error(f"Error: {e}")
        finally:
            if target_socket:
                target_socket.close()
            client_socket.close()
            logging.info(f"Connection with {client_address} closed")
    
    def start_proxy_server(self):
        if self.is_running:
            return
            
        self.is_running = True
        proxy_host = '0.0.0.0'
        proxy_port = 2323
        
        try:
            self.proxy_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.proxy_socket.bind((proxy_host, proxy_port))
            self.proxy_socket.listen(socket.SOMAXCONN)
            
            logging.info(f"Proxy server listening on {proxy_host}:{proxy_port}")
            self.show_notification("Proxy Server", "Proxy service is running in the background")
            
            self.switch_proxy()
            
            while self.is_running:
                client_socket, client_address = self.proxy_socket.accept()
                client_thread = threading.Thread(
                    target=self.handle_client, 
                    args=(client_socket, client_address),
                    daemon=True
                )
                client_thread.start()
            
        except Exception as e:
            logging.error(f"Proxy server error: {e}")
            self.is_running = False
        finally:
            if self.proxy_socket:
                self.proxy_socket.close()
    
    def stop_proxy_server(self):
        self.is_running = False
        self.show_notification("Proxy Server", "Proxy service has been stopped.")
        
        # إيقاف `accept` عبر اتصال مؤقت
        try:
            temp_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            temp_socket.connect(('127.0.0.1', 2323))
            temp_socket.close()
        except:
            pass
        
        logging.info("Proxy server stopped")

def run_proxy():
    proxy_server = ProxyServer()
    proxy_server.start_proxy_server()

def main(page: ft.Page):
    page.title = "Proxy Server"
    page.vertical_alignment = ft.MainAxisAlignment.CENTER
    page.horizontal_alignment = ft.CrossAxisAlignment.CENTER
    page.theme_mode = ft.ThemeMode.DARK
    page.padding = 20

    proxy_process = None  # متغير لتخزين العملية الخلفية

    # عناصر الواجهة
    status_text = ft.Text("Proxy Server: Stopped", size=20, color=ft.colors.RED)
    current_proxy_text = ft.Text("Current Proxy: None", size=16)
    toggle_button = ft.ElevatedButton(
        "Start Proxy",
        width=200
    )
    
    def toggle_proxy_server(e):
        nonlocal proxy_process

        if proxy_process is None:
            # بدء الخادم في عملية مستقلة
            proxy_process = multiprocessing.Process(target=run_proxy, daemon=True)
            proxy_process.start()
            status_text.value = "Proxy Server: Running"
            status_text.color = ft.colors.GREEN
            toggle_button.text = "Stop Proxy"
            show_notification("Proxy Server", "The proxy service is running in the background")
        else:
            # إيقاف الخادم
            proxy_process.terminate()
            proxy_process = None
            status_text.value = "Proxy Server: Stopped"
            status_text.color = ft.colors.RED
            toggle_button.text = "Start Proxy"
            show_notification("Proxy Server", "The proxy service has been stopped.")
        
        page.update()

    toggle_button.on_click = toggle_proxy_server

    # إضافة عناصر الواجهة
    page.add(
        ft.Column(
            [
                ft.Text("Proxy Server App", size=24, weight=ft.FontWeight.BOLD),
                ft.Divider(),
                status_text,
                current_proxy_text,
                toggle_button,
                ft.Text("Designed by Al-Rifai", size=12, color=ft.colors.GREY)
            ],
            spacing=20,
            alignment=ft.MainAxisAlignment.CENTER,
            horizontal_alignment=ft.CrossAxisAlignment.CENTER
        )
    )

if __name__ == "__main__":
    multiprocessing.freeze_support()  # دعم تشغيل العمليات المتعددة على Windows
    ft.app(target=main)
