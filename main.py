import flet as ft
import socket
import multiprocessing
import time
import logging

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
        self.active_connections = multiprocessing.Value('i', 0)  # Shared active connections count

    def get_current_proxy(self):
        return proxies[self.current_proxy_index]

    def switch_proxy(self):
        if not self.is_running:
            return

        self.current_proxy_index = (self.current_proxy_index + 1) % len(proxies)
        logging.info(f"Switched to proxy: {self.get_current_proxy()}")
        threading.Timer(20, self.switch_proxy).start()

    def connect_to_target(self, target_host, target_port, retries=5):
        for attempt in range(retries):
            try:
                target_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                target_socket.settimeout(5.0) 
                target_socket.connect((target_host, target_port))
                return target_socket
            except socket.error as e:
                logging.error(f"Attempt {attempt + 1} failed: {e}")
                if attempt == retries - 1:
                    raise Exception("Failed to connect to target after multiple retries")
                time.sleep(5)

    def handle_client(self, client_socket, client_address, page):
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
                "CONNECT thumbayan.com:443 HTTP/1.1\r\n"
                "Host: thumbayan.com:443\r\n" 
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

    def start_proxy_server(self, page):
        if self.is_running:
            return

        self.is_running = True
        proxy_host = '127.0.0.1' 
        proxy_port = 2323

        try:
            self.proxy_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.proxy_socket.bind((proxy_host, proxy_port))
            self.proxy_socket.listen(socket.SOMAXCONN)

            logging.info(f"Proxy server listening on {proxy_host}:{proxy_port}")
            page.update()

            self.switch_proxy()

            while self.is_running:
                try:
                    client_socket, client_address = self.proxy_socket.accept()
                    # Increment active connection count
                    with self.active_connections.get_lock():
                        self.active_connections.value += 1
                    client_thread = multiprocessing.Process(
                        target=self.handle_client,
                        args=(client_socket, client_address, page)
                    )
                    client_thread.start()
                except Exception as e:
                    if self.is_running:
                        logging.error(f"Error accepting connection: {e}")

        except Exception as e:
            logging.error(f"Proxy server error: {e}")
            self.is_running = False
            page.update()
        finally:
            if self.proxy_socket:
                self.proxy_socket.close()

    def stop_proxy_server(self, page):
        self.is_running = False
        # Create a temporary socket to stop accept
        try:
            temp_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            temp_socket.connect(('127.0.0.1', 2323))
            temp_socket.close()
        except:
            pass

        logging.info("Proxy server stopped")
        page.update()


def main(page: ft.Page):
    page.title = "Proxy Server"
    page.vertical_alignment = ft.MainAxisAlignment.CENTER
    page.horizontal_alignment = ft.CrossAxisAlignment.CENTER
    page.theme_mode = ft.ThemeMode.DARK
    page.padding = 20

    proxy_server = ProxyServer()

    # إعدادات الواجهة
    status_text = ft.Text("Proxy Server: Stopped", size=20, color=ft.colors.RED)
    current_proxy_text = ft.Text("Current Proxy: None", size=16)
    connections_text = ft.Text("Active Connections: 0", size=16)
    toggle_button = ft.ElevatedButton(
        "Start Proxy",
        on_click=lambda e: toggle_proxy_server(e, page, proxy_server, status_text, toggle_button, current_proxy_text),
        width=200
    )

    # إضافة عناصر الواجهة
    page.add(
        ft.Column(
            [
                ft.Image(src="https://via.placeholder.com/150", width=150, height=150),
                ft.Text("Proxy Server App", size=24, weight=ft.FontWeight.BOLD),
                ft.Divider(),
                status_text,
                current_proxy_text,
                connections_text,
                toggle_button,
                ft.Text("Designed by @alrufaaey", size=12, color=ft.colors.GREY) 
            ],
            spacing=20,
            alignment=ft.MainAxisAlignment.CENTER,
            horizontal_alignment=ft.CrossAxisAlignment.CENTER
        )
    )

    # تحديث حالة البروكسي الحالي وعدد الاتصالات
    def update_status():
        while True:
            if proxy_server.is_running:
                current_proxy = proxy_server.get_current_proxy()
                current_proxy_text.value = f"Current Proxy: {current_proxy['host']}:{current_proxy['port']}"
                connections_text.value = f"Active Connections: {proxy_server.active_connections.value}"
                page.update()
            time.sleep(1)

    multiprocessing.Process(target=update_status, daemon=True).start()

def toggle_proxy_server(e, page, proxy_server, status_text, toggle_button, current_proxy_text):
    if not proxy_server.is_running:
        # Start the proxy server in a new process
        multiprocessing.Process(
            target=proxy_server.start_proxy_server,
            args=(page,),
            daemon=True
        ).start()
        status_text.value = "Proxy Server: Running"
        status_text.color = ft.colors.GREEN
        toggle_button.text = "Stop Proxy"
        current_proxy = proxy_server.get_current_proxy()
        current_proxy_text.value = f"Current Proxy: {current_proxy['host']}:{current_proxy['port']}"
    else:
        # Stop the proxy server
        proxy_server.stop_proxy_server(page)
        status_text.value = "Proxy Server: Stopped"
        status_text.color = ft.colors.RED
        toggle_button.text = "Start Proxy"
        current_proxy_text.value = "Current Proxy: None"

    page.update()

if __name__ == "__main__":
    ft.app(target=main)
