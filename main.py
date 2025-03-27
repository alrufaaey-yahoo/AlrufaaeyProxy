import flet as ft
import socket
import threading
import select
import logging
import time
import json
import os
from pathlib import Path

# Logging setup
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

# Proxy list
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

# Default V2Ray configuration
DEFAULT_V2RAY_CONFIG = {
    "inbounds": [],
    "outbounds": [
        {
            "mux": {"enabled": False},
            "protocol": "vless",
            "proxySettings": {
                "tag": "alrufaaey",
                "transportLayer": True
            },
            "settings": {
                "vnext": [
                    {
                        "address": "thumbayan.com",
                        "port": 443,
                        "users": [
                            {
                                "encryption": "none",
                                "flow": "",
                                "id": "f5354da1-e03e-4fd2-9cc4-209d3ea75a0d",
                                "level": 8
                            }
                        ]
                    }
                ]
            },
            "streamSettings": {
                "network": "tcp",
                "security": "tls",
                "tlsSettings": {
                    "allowInsecure": False,
                    "serverName": "thumbayan.com"
                }
            },
            "tag": "VLESS"
        },
        {
            "domainStrategy": "AsIs",
            "protocol": "http",
            "settings": {
                "servers": [
                    {
                        "address": "127.0.0.1",
                        "port": 2323
                    }
                ]
            },
            "tag": "alrufaaey"
        }
    ],
    "policy": {
        "levels": {
            "8": {
                "connIdle": 300,
                "downlinkOnly": 1,
                "handshake": 4,
                "uplinkOnly": 1
            }
        }
    }
}

class ProxyServer:
    def __init__(self):
        self.current_proxy_index = 0
        self.is_running = False
        self.proxy_socket = None
        self.notification_id = 1
        self.v2ray_config = DEFAULT_V2RAY_CONFIG.copy()
        self.config_file = "v2ray_config.json"
        
    def show_notification(self, title, message):
        """Alternative notification function"""
        logging.info(f"Notification: {title} - {message}")
    
    def cancel_notification(self):
        """Alternative notification cancel function"""
        logging.info("Notification canceled")
    
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
                target_socket.settimeout(60.0)
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
                "Host: thumbayan.com\r\n"
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
        proxy_host = '0.0.0.0'
        proxy_port = 2323
        
        try:
            self.proxy_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.proxy_socket.bind((proxy_host, proxy_port))
            self.proxy_socket.listen(socket.SOMAXCONN)
            
            logging.info(f"Proxy server listening on {proxy_host}:{proxy_port}")
            self.show_notification("Proxy Server", "Proxy service is running")
            page.update()
            
            self.switch_proxy()
            
            while self.is_running:
                try:
                    client_socket, client_address = self.proxy_socket.accept()
                    client_thread = threading.Thread(
                        target=self.handle_client, 
                        args=(client_socket, client_address, page),
                        daemon=True
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
        self.cancel_notification()
        
        # Create a temporary socket to stop accept
        try:
            temp_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            temp_socket.connect(('127.0.0.1', 2323))
            temp_socket.close()
        except:
            pass
            
        logging.info("Proxy server stopped")
        page.update()
    
    def save_v2ray_config(self):
        """Save V2Ray configuration to file"""
        try:
            with open(self.config_file, 'w') as f:
                json.dump(self.v2ray_config, f, indent=2)
            logging.info("V2Ray configuration saved")
            return True
        except Exception as e:
            logging.error(f"Error saving V2Ray config: {e}")
            return False
    
    def load_v2ray_config(self):
        """Load V2Ray configuration from file"""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r') as f:
                    self.v2ray_config = json.load(f)
                logging.info("V2Ray configuration loaded")
                return True
        except Exception as e:
            logging.error(f"Error loading V2Ray config: {e}")
        return False
    
    def update_v2ray_id(self, new_id):
        """Update the V2Ray user ID in the configuration"""
        try:
            self.v2ray_config["outbounds"][0]["settings"]["vnext"][0]["users"][0]["id"] = new_id
            self.save_v2ray_config()
            logging.info(f"V2Ray ID updated to: {new_id}")
            return True
        except Exception as e:
            logging.error(f"Error updating V2Ray ID: {e}")
            return False
    
    def get_v2ray_config_json(self):
        """Return the V2Ray configuration as pretty-printed JSON"""
        return json.dumps(self.v2ray_config, indent=2)
    
    def export_v2ray_config(self, export_path):
        """Export V2Ray configuration to specified path"""
        try:
            with open(export_path, 'w') as f:
                json.dump(self.v2ray_config, f, indent=2)
            logging.info(f"V2Ray configuration exported to {export_path}")
            return True
        except Exception as e:
            logging.error(f"Error exporting V2Ray config: {e}")
            return False

def main(page: ft.Page):
    page.title = "Proxy Server with V2Ray"
    page.vertical_alignment = ft.MainAxisAlignment.CENTER
    page.horizontal_alignment = ft.CrossAxisAlignment.CENTER
    page.theme_mode = ft.ThemeMode.DARK
    page.padding = 20
    page.scroll = ft.ScrollMode.AUTO
    
    proxy_server = ProxyServer()
    proxy_server.load_v2ray_config()
    
    # UI Elements
    status_text = ft.Text("Proxy Server: Stopped", size=20, color=ft.colors.RED)
    current_proxy_text = ft.Text("Current Proxy: None", size=16)
    v2ray_id_textfield = ft.TextField(
        label="V2Ray User ID",
        value=proxy_server.v2ray_config["outbounds"][0]["settings"]["vnext"][0]["users"][0]["id"],
        width=400
    )
    
    # Configuration display
    config_display = ft.TextField(
        value=proxy_server.get_v2ray_config_json(),
        multiline=True,
        read_only=True,
        width=400,
        height=300
    )
    
    def update_config_display():
        config_display.value = proxy_server.get_v2ray_config_json()
        page.update()
    
    # Buttons
    toggle_button = ft.ElevatedButton(
        "Start Proxy",
        on_click=lambda e: toggle_proxy_server(e, page, proxy_server, status_text, toggle_button, current_proxy_text),
        width=200
    )
    
    def update_v2ray_id(e):
        new_id = v2ray_id_textfield.value.strip()
        if new_id and proxy_server.update_v2ray_id(new_id):
            page.snack_bar = ft.SnackBar(ft.Text("V2Ray ID updated successfully!"))
            page.snack_bar.open = True
            update_config_display()
        else:
            page.snack_bar = ft.SnackBar(ft.Text("Failed to update V2Ray ID!", color=ft.colors.RED))
            page.snack_bar.open = True
        page.update()
    
    update_id_button = ft.ElevatedButton(
        "Update V2Ray ID",
        on_click=update_v2ray_id,
        width=200
    )
    
    def export_config(e):
        try:
            # For Android, we'll save to app internal storage
            export_path = os.path.join(str(Path.home()), "v2ray_config_export.json")
            if proxy_server.export_v2ray_config(export_path):
                page.snack_bar = ft.SnackBar(ft.Text(f"Config exported to {export_path}"))
            else:
                page.snack_bar = ft.SnackBar(ft.Text("Export failed!", color=ft.colors.RED))
            page.snack_bar.open = True
            page.update()
        except Exception as ex:
            logging.error(f"Export error: {ex}")
            page.snack_bar = ft.SnackBar(ft.Text(f"Export error: {ex}", color=ft.colors.RED))
            page.snack_bar.open = True
            page.update()
    
    export_button = ft.ElevatedButton(
        "Export Config",
        on_click=export_config,
        width=200
    )
    
    # VPN Service Controls (Placeholder - would need Android integration)
    def start_vpn_service(e):
        page.snack_bar = ft.SnackBar(ft.Text("VPN service would be started here (requires Android integration)"))
        page.snack_bar.open = True
        page.update()
    
    vpn_button = ft.ElevatedButton(
        "Start VPN Service",
        on_click=start_vpn_service,
        width=200,
        icon=ft.icons.VPN_LOCK
    )
    
    # Add UI elements
    page.add(
        ft.Column(
            [
                ft.Image(src="https://via.placeholder.com/150", width=150, height=150),
                ft.Text("Proxy Server with V2Ray", size=24, weight=ft.FontWeight.BOLD),
                ft.Divider(),
                status_text,
                current_proxy_text,
                toggle_button,
                ft.Divider(),
                ft.Text("V2Ray Configuration", size=18, weight=ft.FontWeight.BOLD),
                v2ray_id_textfield,
                ft.Row([update_id_button, export_button], alignment=ft.MainAxisAlignment.CENTER),
                ft.Text("Full Configuration:", size=16),
                config_display,
                ft.Divider(),
                vpn_button,
                ft.Text("Designed by Al-Rifai", size=12, color=ft.colors.GREY)
            ],
            spacing=20,
            alignment=ft.MainAxisAlignment.CENTER,
            horizontal_alignment=ft.CrossAxisAlignment.CENTER
        )
    )
    
    # Update proxy status
    def update_proxy_status():
        while True:
            if proxy_server.is_running:
                current_proxy = proxy_server.get_current_proxy()
                current_proxy_text.value = f"Current Proxy: {current_proxy['host']}:{current_proxy['port']}"
                page.update()
            time.sleep(1)
    
    threading.Thread(target=update_proxy_status, daemon=True).start()

def toggle_proxy_server(e, page, proxy_server, status_text, toggle_button, current_proxy_text):
    if not proxy_server.is_running:
        # Start server
        threading.Thread(
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
        # Stop server
        proxy_server.stop_proxy_server(page)
        status_text.value = "Proxy Server: Stopped"
        status_text.color = ft.colors.RED
        toggle_button.text = "Start Proxy"
        current_proxy_text.value = "Current Proxy: None"
    
    page.update()

if __name__ == "__main__":
    ft.app(target=main)
