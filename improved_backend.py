import socket
import threading
import select
import logging
import time

# إعدادات التسجيل
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class MultiPartProxy:
    def __init__(self, local_port=2323, remote_host='lifetwist.net', remote_port=443, parts=32):
        self.local_port = local_port
        self.remote_host = remote_host
        self.remote_port = remote_port
        self.parts = parts
        self.is_running = False
        self.server_socket = None
        # الهيدر المخصص مع علامات الاستبدال
        self.custom_header_template = (
            "CONNECT {host_port} HTTP/1.1\r\n"
            "Host: {host_port}\r\n"
            "User-Agent: Mozilla/5.0 (Linux; Android 14; SM-A245F Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.138 Mobile Safari/537.36 [FBAN/InternetOrgApp;FBAV/166.0.0.0.169;]\r\n"
            "x-iorg-bsid: a08359b0-d7ec-4cb5-97bf-000bdc29ec87\r\n"
            "\r\n"
        )

    def handle_client(self, client_socket):
        try:
            # إنشاء اتصال بالخادم البعيد (lifetwist.net:443 بشكل افتراضي أو حسب الطلب)
            remote_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            remote_socket.connect((self.remote_host, self.remote_port))
            
            # بناء الهيدر المخصص بالهوست والمنفذ الفعليين
            host_port = f"{self.remote_host}:{self.remote_port}"
            custom_header = self.custom_header_template.format(host_port=host_port)
            
            # إرسال الهيدر المخصص أولاً إلى الخادم البعيد
            remote_socket.sendall(custom_header.encode())
            
            # إعداد المقابس للمراقبة
            sockets = [client_socket, remote_socket]
            
            while self.is_running:
                readable, _, _ = select.select(sockets, [], [], 1)
                if not readable:
                    continue
                
                for s in readable:
                    data = s.recv(8192)
                    if not data:
                        return
                    
                    if s is client_socket:
                        # تقسيم البيانات المرسلة من العميل إلى الخادم
                        if len(data) > self.parts:
                            chunk_size = max(1, len(data) // self.parts)
                            for i in range(0, len(data), chunk_size):
                                remote_socket.sendall(data[i:i+chunk_size])
                        else:
                            remote_socket.sendall(data)
                    else:
                        # تقسيم البيانات المستلمة من الخادم إلى العميل
                        if len(data) > self.parts:
                            chunk_size = max(1, len(data) // self.parts)
                            for i in range(0, len(data), chunk_size):
                                client_socket.sendall(data[i:i+chunk_size])
                        else:
                            client_socket.sendall(data)
                            
        except Exception as e:
            logging.error(f"Error in proxy handling: {e}")
        finally:
            client_socket.close()
            if 'remote_socket' in locals():
                remote_socket.close()

    def start(self):
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind(('0.0.0.0', self.local_port))
            self.server_socket.listen(128)
            self.is_running = True
            logging.info(f"Proxy started on port {self.local_port}, forwarding to {self.remote_host}:{self.remote_port} with 32 parts and custom headers.")
            
            while self.is_running:
                try:
                    client_sock, addr = self.server_socket.accept()
                    threading.Thread(target=self.handle_client, args=(client_sock,), daemon=True).start()
                except Exception as e:
                    if self.is_running:
                        logging.error(f"Accept error: {e}")
        except Exception as e:
            logging.error(f"Failed to start server: {e}")
        
    def stop(self):
        self.is_running = False
        if self.server_socket:
            self.server_socket.close()
            self.server_socket = None
