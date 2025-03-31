import flet as ft
import socket
import threading
import select
import logging
import time
import sys
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

class PortListener:
    def __init__(self):
        self.is_running = False
        self.server_socket = None
        self.notification_id = 1
        self.current_proxy_index = 0
        self.ui_active = False
        self.status_callback = None
        self.proxy_callback = None
        
    def register_status_callback(self, callback):
        self.status_callback = callback
        
    def register_proxy_callback(self, callback):
        self.proxy_callback = callback
        
    def update_status(self, status, color):
        if self.status_callback and self.ui_active:
            self.status_callback(status, color)
            
    def update_proxy(self, proxy_info):
        if self.proxy_callback and self.ui_active:
            self.proxy_callback(proxy_info)
    
    def show_notification(self, title, message):
        """Show system notification"""
        try:
            notification.notify(
                title=title,
                message=message,
                app_name="Port Listener"
            )
        except Exception as e:
            logging.error(f"Error showing notification: {e}")
    
    def cancel_notification(self):
        """Cancel system notification"""
        try:
            notification.notify(
                title="Port Listener",
                message="Service stopped",
                app_name="Port Listener"
            )
        except Exception as e:
            logging.error(f"Error canceling notification: {e}")
    
    def get_current_proxy(self):
        return proxies[self.current_proxy_index]
    
    def switch_proxy(self):
        if not self.is_running:
            return
            
        self.current_proxy_index = (self.current_proxy_index + 1) % len(proxies)
        current_proxy = self.get_current_proxy()
        logging.info(f"Switched to proxy: {current_proxy}")
        self.update_proxy(f"Current Proxy: {current_proxy['host']}:{current_proxy['port']}")
        threading.Timer(20, self.switch_proxy).start()
    
    def connect_to_target(self, target_host, target_port, retries=5):
        for attempt in range(retries):
            try:
                target_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                target_socket.settimeout(60.0)
                target_socket.connect((target_host, target_port))
                return target_socket
            except socket.error as e:
                logging.error(f"Attempt {attempt + 1} failed: {e}")
                if attempt == retries - 1:
                    raise Exception("Failed to connect to target after multiple retries")
                time.sleep(5)
    
    def handle_client(self, client_socket, client_address):
        target_socket = None
        try:
            logging.info(f"Connection from {client_address}")
            
            request = client_socket.recv(4096).decode('utf-8')
            logging.info(f"Received request: {request}")
            
            proxy = self.get_current_proxy()
            target_host = proxy['host']
            target_port = proxy['port']
            
            target_socket = self.connect_to_target(target_host, target_port)
            
            headers = (
                "CONNECT lifetwist.net:443 HTTP/1.1\r\n"
                "Host: lifetwist.net:443\r\n"
                "User-Agent: Mozilla/5.0 (Linux; Android 14; SM-A245F Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.138 Mobile Safari/537.36 [FBAN/InternetOrgApp;FBAV/166.0.0.0.169;]\r\n"
                "x-iorg-bsid: a08359b0-d7ec-4cb5-97bf-000bdc29ec87\r\n"
                "\r\n"
            )
            
            target_socket.send(headers.encode('utf-8'))
            
            while self.is_running:
                ready = select.select([client_socket, target_socket], [], [], 1.0)
                
                if not ready[0]:
                    continue
                
                for sock in ready[0]:
                    if sock == client_socket:
                        client_data = client_socket.recv(4096)
                        if not client_data:
                            logging.info("Client closed the connection")
                            return
                        target_socket.send(client_data)
                    else:
                        target_data = target_socket.recv(4096)
                        if not target_data:
                            logging.info("Target server closed the connection")
                            return
                        client_socket.send(target_data)
                        
        except (socket.timeout, ConnectionResetError) as e:
            logging.error(f"Error: {e}")
        finally:
            if target_socket:
                target_socket.close()
            client_socket.close()
            logging.info(f"Connection with {client_address} closed")
    
    def start_port_listener(self):
        if self.is_running:
            return
            
        self.is_running = True
        listen_host = '0.0.0.0'
        listen_port = 2323
        
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.bind((listen_host, listen_port))
            self.server_socket.listen(socket.SOMAXCONN)
            
            logging.info(f"Listening on port {listen_host}:{listen_port}")
            self.show_notification("Port Listener", f"Port {listen_port} is now listening")
            self.update_status(f"Port {listen_port}: Listening", "green")
            
            self.switch_proxy()
            
            while self.is_running:
                try:
                    client_socket, client_address = self.server_socket.accept()
                    client_thread = threading.Thread(
                        target=self.handle_client, 
                        args=(client_socket, client_address),
                        daemon=True
                    )
                    client_thread.start()
                except Exception as e:
                    if self.is_running:
                        logging.error(f"Error accepting connection: {e}")
            
        except Exception as e:
            logging.error(f"Port listener error: {e}")
            self.is_running = False
            self.update_status(f"Port {listen_port}: Error", "red")
        finally:
            if self.server_socket:
                self.server_socket.close()
    
    def stop_port_listener(self):
        self.is_running = False
        self.cancel_notification()
        self.update_status("Port 2323: Stopped", "red")
        
        # إنشاء socket مؤقت لإيقاف accept
        try:
            temp_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            temp_socket.connect(('0.0.0.0', 2323))
            temp_socket.close()
        except:
            pass
            
        logging.info(f"Port 2323 listener stopped")

def main(page: ft.Page):
    page.title = "Port Listener"
    page.vertical_alignment = ft.MainAxisAlignment.CENTER
    page.horizontal_alignment = ft.CrossAxisAlignment.CENTER
    page.theme_mode = ft.ThemeMode.DARK
    page.padding = 20
    
    # Create a single instance of PortListener
    if not hasattr(page, 'port_listener'):
        page.port_listener = PortListener()
    
    port_listener = page.port_listener
    port_listener.ui_active = True
    
    # عناصر الواجهة
    status_text = ft.Text("Port 2323: Stopped", size=20, color=ft.colors.RED)
    current_proxy_text = ft.Text("Current Proxy: None", size=16)
    toggle_button = ft.ElevatedButton(
        "Start Listening",
        on_click=lambda e: toggle_port_listener(e, port_listener, status_text, toggle_button, current_proxy_text),
        width=200
    )
    
    # Register callbacks
    def update_status(status, color):
        status_text.value = status
        status_text.color = color
        page.update()
        
    def update_proxy(proxy_info):
        current_proxy_text.value = proxy_info
        page.update()
    
    port_listener.register_status_callback(update_status)
    port_listener.register_proxy_callback(update_proxy)
    
    # إضافة عناصر الواجهة
    page.add(
        ft.Column(
            [
                ft.Image(src="https://via.placeholder.com/150", width=150, height=150),
                ft.Text("Port Listener App", size=24, weight=ft.FontWeight.BOLD),
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
    
    # Check if we should start listening automatically
    if port_listener.is_running:
        status_text.value = "Port 2323: Listening"
        status_text.color = ft.colors.GREEN
        toggle_button.text = "Stop Listening"
        current_proxy = port_listener.get_current_proxy()
        current_proxy_text.value = f"Current Proxy: {current_proxy['host']}:{current_proxy['port']}"
        page.update()

def toggle_port_listener(e, port_listener, status_text, toggle_button, current_proxy_text):
    if not port_listener.is_running:
        # بدء الخادم
        threading.Thread(
            target=port_listener.start_port_listener,
            daemon=True
        ).start()
        toggle_button.text = "Stop Listening"
    else:
        # إيقاف الخادم
        port_listener.stop_port_listener()
        toggle_button.text = "Start Listening"
    
    page.update()

def run_as_service():
    """Run the port listener as a background service"""
    port_listener = PortListener()
    port_listener.start_port_listener()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        port_listener.stop_port_listener()

if __name__ == "__main__":
    # Check if we should run as a service
    if "--service" in sys.argv:
        run_as_service()
    else:
        # Start the UI
        ft.app(target=main)
