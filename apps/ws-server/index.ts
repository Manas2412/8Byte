import { WebSocketServer } from "ws";
import jwt, { JwtPayload } from 'jsonwebtoken';
import { JWT_SECRET } from "backend-common/config";


const wss = new WebSocketServer({ port: 8080 });

// Log when the server itself starts
console.log("🚀 WebSocket server is running on ws://localhost:8080");

wss.on('connection', function connection(ws, request) {
    console.log('🔗 Client connected');

    const url = request.url;
    if(!url){
        return;
    }

    const queryParams = new URLSearchParams(url.split('?')[1]);
    const token = queryParams.get('token') || "";

    const decoded = jwt.verify(token, JWT_SECRET);

    if(typeof decoded == "string"){
        ws.close();
        return;
    }

    if(!decoded || !decoded.userId){
        ws.close();
        return;
    }

    ws.on('message', function message(data) {
        console.log("📩 Received message:", data.toString());
        ws.send('pong');
    });
});
